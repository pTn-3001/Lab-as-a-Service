import { Injectable, BadRequestException, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import * as mysql from 'mysql2/promise';
import { firstValueFrom } from 'rxjs';

export interface CreateGuacamoleConnectionRequest {
  connectionName: string;
  host: string;
  port: number;
  username?: string;
  password?: string;
}

export interface GuacamoleConnectionResponse {
  connectionId: number;
  connectionName: string;
  guacamoleUrl: string;
}

@Injectable()
export class GuacamoleService {
  private logger = new Logger('GuacamoleService');
  private mysqlHost: string;
  private mysqlUser: string;
  private mysqlPassword: string;
  private mysqlDatabase: string;

  /**
   * Internal URL for backend → Guacamole API calls (e.g. token retrieval).
   * Runs on the same server, so typically http://localhost:8080/guacamole.
   */
  private guacamoleInternalUrl: string;
  private guacamoleApiUrl: string;

  /**
   * Public URL that the USER's BROWSER can reach.
   * Used for constructing redirect URLs (e.g. http://221.132.18.35:7300/guacamole).
   */
  private guacamolePublicUrl: string;

  /**
   * Guacamole JDBC data source identifier.
   * Needed for encoding connection identifiers in client URLs.
   * Default: 'mysql' for guacamole-auth-jdbc-mysql extension.
   */
  private guacamoleDataSource: string;

  /**
   * Credentials for the Guacamole API user that creates connections.
   */
  private guacamoleApiUser: string;
  private guacamoleApiPassword: string;

  /**
   * Optional SSH gateway (jump host) for guacd to reach VMs on private networks.
   * When set, guacd connects to this gateway first, then hops to the target VM.
   */
  private sshGatewayHostname: string;
  private sshGatewayPort: string;
  private sshGatewayUsername: string;
  private sshGatewayPassword: string;

  constructor(
    private configService: ConfigService,
    private httpService: HttpService
  ) {
    this.mysqlHost = this.configService.get('GUACAMOLE_MYSQL_HOST') || 'localhost';
    this.mysqlUser = this.configService.get('GUACAMOLE_MYSQL_USER') || 'guacuser';
    this.mysqlPassword = this.configService.get('GUACAMOLE_MYSQL_PASSWORD') || 'guacpass';
    this.mysqlDatabase = this.configService.get('GUACAMOLE_MYSQL_DATABASE') || 'guacamole_db';

    // Internal URL: backend → Guacamole (on same server)
    this.guacamoleInternalUrl = (
      this.configService.get('GUACAMOLE_INTERNAL_URL') ||
      'http://localhost:8080/guacamole'
    ).replace(/\/+$/, '');

    // Public URL: browser → Guacamole (through nginx / NAT)
    this.guacamolePublicUrl = (
      this.configService.get('GUACAMOLE_PUBLIC_URL') ||
      this.configService.get('GUACAMOLE_BASE_URL') ||
      this.guacamoleInternalUrl
    ).replace(/\/+$/, '');

    this.guacamoleApiUrl = `${this.guacamoleInternalUrl}/api`;

    // Data source name matches the JDBC extension identifier
    this.guacamoleDataSource = this.configService.get('GUACAMOLE_DATASOURCE') || 'mysql';

    // API user for obtaining auth tokens
    this.guacamoleApiUser = this.configService.get('GUACAMOLE_API_USER') || 'quickconnect';
    this.guacamoleApiPassword = this.configService.get('GUACAMOLE_API_PASSWORD') || 'quickconnect';

    // SSH gateway (jump host) for guacd to reach VMs on private OpenStack networks
    this.sshGatewayHostname = this.configService.get('GUACAMOLE_SSH_GATEWAY_HOSTNAME') || '';
    this.sshGatewayPort = this.configService.get('GUACAMOLE_SSH_GATEWAY_PORT') || '22';
    this.sshGatewayUsername = this.configService.get('GUACAMOLE_SSH_GATEWAY_USERNAME') || '';
    this.sshGatewayPassword = this.configService.get('GUACAMOLE_SSH_GATEWAY_PASSWORD') || '';

    this.logger.log(`Initialized with MySQL: ${this.mysqlHost}/${this.mysqlDatabase}`);
    this.logger.log(`Guacamole Internal API: ${this.guacamoleApiUrl}`);
    this.logger.log(`Guacamole Public URL: ${this.guacamolePublicUrl}`);
    this.logger.log(`Guacamole DataSource: ${this.guacamoleDataSource}`);
  }

  /**
   * Encode a connection identifier for Guacamole's Angular client URL.
   *
   * Guacamole client expects: Base64( connectionId + '\0' + 'c' + '\0' + dataSource )
   * Where 'c' means connection type (vs 'g' for connection group).
   */
  private encodeClientIdentifier(connectionId: number): string {
    const raw = `${connectionId}\0c\0${this.guacamoleDataSource}`;
    return Buffer.from(raw, 'utf-8').toString('base64');
  }

  private async getGuacamoleToken(username: string, password: string): Promise<string> {
    try {
      this.logger.debug(`Getting Guacamole token for user: ${username}`);
      const formData = new URLSearchParams();
      formData.append('username', username);
      formData.append('password', password);

      const response = await firstValueFrom(
        this.httpService.post<{ authToken: string }>(
          `${this.guacamoleApiUrl}/tokens`,
          formData.toString(),
          {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
          }
        )
      );
      const token = response.data.authToken;
      this.logger.log(`Token received for user: ${username}`);
      return token;
    } catch (error) {
      this.logger.error(`Failed to get Guacamole token: ${error instanceof Error ? error.message : String(error)}`);
      throw new InternalServerErrorException(`Failed to authenticate with Guacamole: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async createSshConnection(request: CreateGuacamoleConnectionRequest): Promise<GuacamoleConnectionResponse> {
    if (!request.connectionName?.trim() || !request.host?.trim()) {
      throw new BadRequestException('Missing required fields: connectionName, host');
    }

    const port = request.port || 22;
    this.logger.log(`Creating Guacamole connection: ${request.connectionName} directly to ${request.host}:${port}`);

    let connection: mysql.Connection | undefined;
    let connectionId: number;
    try {
      this.logger.debug(`Connecting to MySQL at ${this.mysqlHost}/${this.mysqlDatabase}...`);
      connection = await mysql.createConnection({
        host: this.mysqlHost,
        user: this.mysqlUser,
        password: this.mysqlPassword,
        database: this.mysqlDatabase,
      });
      this.logger.log('MySQL connection established');

      // 1. Create connection record
      this.logger.debug(`Inserting connection record: ${request.connectionName}`);
      const [result] = await connection.execute(
        'INSERT INTO guacamole_connection (connection_name, protocol) VALUES (?, ?)',
        [request.connectionName.trim(), 'ssh']
      );

      connectionId = (result as ResultSetHeader).insertId;
      this.logger.log(`Connection created with ID: ${connectionId}`);

      // 2. Insert SSH parameters
      const params = [
        { name: 'hostname', value: request.host.trim() },
        { name: 'port', value: String(port) },
        { name: 'font-name', value: 'monospace' },
        { name: 'font-size', value: '12' },
        { name: 'enable-sftp', value: 'false' },
        { name: 'create-recording-path', value: 'false' },
        { name: 'strict-host-key-checking', value: 'false' },
        // Keepalive: send a keepalive packet every 30 s, give up after 10 missed packets.
        // Prevents the SSH server from silently closing idle sessions.
        { name: 'server-alive-interval', value: '30' },
        { name: 'server-alive-count-max', value: '10' },
      ];

      if (request.username?.trim()) {
        params.push({ name: 'username', value: request.username.trim() });
      }
      if (request.password) {
        params.push({ name: 'password', value: request.password });
      }

      // SSH gateway (jump host) — guacd hops through this to reach VMs on private networks
      if (this.sshGatewayHostname) {
        params.push({ name: 'gateway-hostname', value: this.sshGatewayHostname });
        params.push({ name: 'gateway-port',     value: this.sshGatewayPort || '22' });
        if (this.sshGatewayUsername) params.push({ name: 'gateway-username', value: this.sshGatewayUsername });
        if (this.sshGatewayPassword) params.push({ name: 'gateway-password', value: this.sshGatewayPassword });
        this.logger.log(`Using SSH gateway: ${this.sshGatewayUsername}@${this.sshGatewayHostname}:${this.sshGatewayPort || 22}`);
      }

      this.logger.debug(`Inserting ${params.length} parameters...`);
      for (const param of params) {
        await connection.execute(
          'INSERT INTO guacamole_connection_parameter (connection_id, parameter_name, parameter_value) VALUES (?, ?, ?)',
          [connectionId, param.name, param.value]
        );
      }
      this.logger.log('Parameters inserted successfully');

      // 3. Grant READ permission to the quickconnect user so they can access this connection
      await this.grantConnectionPermission(connection, connectionId);

      // 4. Get auth token from Guacamole API
      const token = await this.getGuacamoleToken(this.guacamoleApiUser, this.guacamoleApiPassword);

      // 5. Build client URL using PUBLIC URL (for the user's browser) with proper Base64 identifier
      const encodedIdentifier = this.encodeClientIdentifier(connectionId);
      const guacamoleUrl = `${this.guacamolePublicUrl}/#/client/${encodeURIComponent(encodedIdentifier)}?token=${token}`;
      this.logger.log(`Guacamole URL: ${guacamoleUrl}`);

      return {
        connectionId,
        connectionName: request.connectionName,
        guacamoleUrl,
      };
    } catch (error) {
      this.logger.error('Failed to create Guacamole connection:', error);
      throw new InternalServerErrorException(`Failed to create Guacamole connection: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      if (connection) {
        await connection.end();
        this.logger.debug('MySQL connection closed');
      }
    }
  }

  /**
   * Grant READ permission on a connection to the quickconnect user.
   * Required for MySQL JDBC auth — without this the user cannot access the connection.
   */
  private async grantConnectionPermission(connection: mysql.Connection, connectionId: number): Promise<void> {
    try {
      // Find the entity_id for the quickconnect user
      const [rows] = await connection.execute<RowDataPacket[]>(
        `SELECT e.entity_id FROM guacamole_entity e
         INNER JOIN guacamole_user u ON u.entity_id = e.entity_id
         WHERE e.name = ? AND e.type = 'USER'`,
        [this.guacamoleApiUser]
      );

      if (!rows || rows.length === 0) {
        this.logger.warn(`Guacamole user '${this.guacamoleApiUser}' not found in DB — skipping permission grant. The user may need system-level ADMINISTER permission to access all connections.`);
        return;
      }

      const entityId = rows[0].entity_id;

      // Grant READ permission so the user can open this connection
      await connection.execute(
        `INSERT IGNORE INTO guacamole_connection_permission (entity_id, connection_id, permission)
         VALUES (?, ?, 'READ')`,
        [entityId, connectionId]
      );

      this.logger.debug(`Granted READ permission on connection ${connectionId} to entity ${entityId}`);
    } catch (error) {
      // Non-fatal: log warning but don't fail the connection creation
      this.logger.warn(`Failed to grant connection permission (non-fatal): ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async deleteConnection(connectionId: number): Promise<void> {
    let connection: mysql.Connection | undefined;
    try {
      connection = await mysql.createConnection({
        host: this.mysqlHost,
        user: this.mysqlUser,
        password: this.mysqlPassword,
        database: this.mysqlDatabase,
      });

      // CASCADE delete handles guacamole_connection_parameter and guacamole_connection_permission
      await connection.execute('DELETE FROM guacamole_connection WHERE connection_id = ?', [connectionId]);

      this.logger.log(`Deleted connection ${connectionId}`);
    } catch (error) {
      this.logger.error(`Failed to delete connection ${connectionId}:`, error);
      throw new InternalServerErrorException(`Failed to delete connection: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      if (connection) {
        await connection.end();
      }
    }
  }
}
