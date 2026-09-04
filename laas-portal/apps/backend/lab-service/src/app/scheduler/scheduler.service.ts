import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { CheckpointService } from '../session/checkpoint.service';
import axios from 'axios';

/**
 * Scheduler service for background jobs.
 *
 * Responsibilities:
 * - Clean up expired lab sessions
 * - Notify orchestration-service to clean up Heat stacks
 * - Handle graceful shutdown
 */
@Injectable()
export class SchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SchedulerService.name);

  // Session cleanup runs every 5 minutes
  private readonly SESSION_CLEANUP_INTERVAL = 5 * 60 * 1000;

  // Stack cleanup runs every 10 minutes
  private readonly STACK_CLEANUP_INTERVAL = 10 * 60 * 1000;

  // Checkpoint polling runs every 30 seconds
  private readonly CHECKPOINT_POLL_INTERVAL = 30 * 1000;

  private sessionCleanupTimer: NodeJS.Timeout | null = null;
  private stackCleanupTimer: NodeJS.Timeout | null = null;
  private checkpointPollTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly checkpointService: CheckpointService,
  ) {}

  async onModuleInit() {
    this.logger.log('Scheduler service initializing...');
    this.startSessionCleanup();
    this.startStackCleanup();
    this.startCheckpointPolling();
  }

  async onModuleDestroy() {
    this.logger.log('Scheduler service shutting down...');
    this.stopSessionCleanup();
    this.stopStackCleanup();
    this.stopCheckpointPolling();
  }

  /**
   * Start periodic session expiry cleanup.
   * Deletes sessions that have expired (expiresAt < now).
   */
  private startSessionCleanup(): void {
    this.logger.log(
      `Starting session cleanup job (interval: ${this.SESSION_CLEANUP_INTERVAL}ms)`,
    );

    this.sessionCleanupTimer = setInterval(() => {
      this.cleanupExpiredSessions().catch((error) => {
        this.logger.error('Session cleanup job failed', error);
      });
    }, this.SESSION_CLEANUP_INTERVAL);

    // Run immediately on startup
    this.cleanupExpiredSessions().catch((error) => {
      this.logger.error('Initial session cleanup job failed', error);
    });
  }

  /**
   * Start periodic Heat stack cleanup notifications.
   * Sends cleanup requests to orchestration-service for sessions with expired stacks.
   */
  private startStackCleanup(): void {
    this.logger.log(
      `Starting stack cleanup job (interval: ${this.STACK_CLEANUP_INTERVAL}ms)`,
    );

    this.stackCleanupTimer = setInterval(() => {
      this.notifyStackCleanup().catch((error) => {
        this.logger.error('Stack cleanup notification job failed', error);
      });
    }, this.STACK_CLEANUP_INTERVAL);

    // Run immediately on startup
    this.notifyStackCleanup().catch((error) => {
      this.logger.error('Initial stack cleanup notification job failed', error);
    });
  }

  /**
   * Clean up expired sessions (mark status as STOPPED without deleting history).
   */
  private async cleanupExpiredSessions(): Promise<void> {
    try {
      const now = new Date();
      // Instead of deleting sessions from the database, transition active expired sessions to STOPPED to preserve practice history
      const updateResult = await this.prisma.labSession.updateMany({
        where: {
          expiresAt: {
            lt: now,
          },
          status: {
            in: ['STARTING', 'RUNNING'],
          },
        },
        data: {
          status: 'STOPPED',
          endedAt: now,
        },
      });

      if (updateResult.count > 0) {
        this.logger.log(`Marked ${updateResult.count} expired session(s) as STOPPED`);
      }
    } catch (error) {
      this.logger.error('Error during session cleanup', error);
    }
  }

  /**
   * Notify orchestration-service to clean up Heat stacks for expired sessions.
   */
  private async notifyStackCleanup(): Promise<void> {
    try {
      const orchestrationBaseUrl = this.configService.get<string>(
        'ORCHESTRATION_SERVICE_BASE_URL',
      );

      if (!orchestrationBaseUrl) {
        this.logger.debug(
          'ORCHESTRATION_SERVICE_BASE_URL not set; skipping stack cleanup notification',
        );
        return;
      }

      const now = new Date();

      // Find sessions that have expired and have associated stacks
      const expiredSessionsWithStacks = await this.prisma.labSession.findMany({
        where: {
          expiresAt: {
            lt: now,
          },
          openstackStackId: {
            not: null,
          },
        },
        select: {
          id: true,
          openstackStackId: true,
          moduleId: true,
        },
      });

      if (expiredSessionsWithStacks.length === 0) {
        return;
      }

      this.logger.log(
        `Found ${expiredSessionsWithStacks.length} expired session(s) with Heat stack(s)`,
      );

      // Notify orchestration-service to clean up stacks
      for (const session of expiredSessionsWithStacks) {
        if (!session.openstackStackId) continue;
        try {
          await axios.post(
            `${orchestrationBaseUrl}/api/v1/stacks/${session.openstackStackId}/cleanup`,
            {},
            { timeout: 10000 },
          );

          this.logger.log(
            `Sent stack cleanup notification for session ${session.id} (stack: ${session.openstackStackId})`,
          );
        } catch (error) {
          this.logger.warn(
            `Failed to notify cleanup for stack ${session.openstackStackId}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }

        // Clear openstackStackId on the session and ensure status is STOPPED so we don't repeat cleanup
        await this.prisma.labSession
          .update({
            where: { id: session.id },
            data: { openstackStackId: null, status: 'STOPPED', endedAt: now },
          })
          .catch(() => {});
      }
    } catch (error) {
      this.logger.error('Error during stack cleanup notification', error);
    }
  }

  private startCheckpointPolling(): void {
    this.logger.log(
      `Starting checkpoint polling job (interval: ${this.CHECKPOINT_POLL_INTERVAL}ms)`,
    );
    this.checkpointPollTimer = setInterval(() => {
      this.checkpointService.pollCheckpoints().catch((error) => {
        this.logger.error('Checkpoint polling job failed', error);
      });
    }, this.CHECKPOINT_POLL_INTERVAL);
  }

  private stopSessionCleanup(): void {
    if (this.sessionCleanupTimer) {
      clearInterval(this.sessionCleanupTimer);
      this.sessionCleanupTimer = null;
      this.logger.log('Session cleanup job stopped');
    }
  }

  private stopStackCleanup(): void {
    if (this.stackCleanupTimer) {
      clearInterval(this.stackCleanupTimer);
      this.stackCleanupTimer = null;
      this.logger.log('Stack cleanup job stopped');
    }
  }

  private stopCheckpointPolling(): void {
    if (this.checkpointPollTimer) {
      clearInterval(this.checkpointPollTimer);
      this.checkpointPollTimer = null;
      this.logger.log('Checkpoint polling job stopped');
    }
  }
}
