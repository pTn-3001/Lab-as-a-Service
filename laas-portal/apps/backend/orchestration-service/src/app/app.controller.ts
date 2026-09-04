import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

// Lightweight health/check endpoint for smoke tests and local debugging.
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  // GET /api
  @Get()
  getData() {
    return this.appService.getData();
  }
}
