import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  // Static payload is enough for service liveness checks.
  getData(): { message: string } {
    return { message: 'Hello API' };
  }
}
