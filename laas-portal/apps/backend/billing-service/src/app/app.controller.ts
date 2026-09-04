import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { AppService } from './app.service';

@Controller('v1/billing')
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Post('payments')
  async createPayment(
    @Body()
    body: {
      userId: string;
      userEmail?: string;
      labTemplateId: string;
      labName: string;
      amount: number;
    },
  ) {
    const txn = await this.appService.createTransaction(body);
    return { success: true, data: txn };
  }

  @Get('payments/history')
  async getPaymentHistory(@Query('userId') userId: string) {
    const history = await this.appService.getHistory(userId);
    return { success: true, data: history };
  }

  @Get('payments/check')
  async checkPurchased(
    @Query('userId') userId: string,
    @Query('labTemplateId') labTemplateId: string,
  ) {
    const purchased = await this.appService.checkPurchased(userId, labTemplateId);
    return { success: true, purchased };
  }

  @Get('payments/all')
  async getAllPayments() {
    const data = await this.appService.getAllPayments();
    return { success: true, data };
  }
}
