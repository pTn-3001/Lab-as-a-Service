import { Controller, Post, Body, HttpCode } from '@nestjs/common';
import { CheckpointService } from './checkpoint.service';
import { successResponse } from '../common/response.helper';

@Controller('checkpoints')
export class CheckpointController {
  constructor(private readonly checkpointService: CheckpointService) {}

  @Post('signal')
  @HttpCode(200)
  signal(@Body() body: { sessionId: string; checkpointCode: string }) {
    return this.checkpointService
      .signalCheckpoint(body.sessionId, body.checkpointCode)
      .then((data) => successResponse('Checkpoint signalled', data));
  }
}
