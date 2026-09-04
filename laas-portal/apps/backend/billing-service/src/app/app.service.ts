import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';

@Injectable()
export class AppService {
  constructor(private readonly prisma: PrismaService) {}

  async createTransaction(dto: {
    userId: string;
    userEmail?: string;
    labTemplateId: string;
    labName: string;
    amount: number;
  }) {
    return this.prisma.transaction.create({
      data: {
        userId: dto.userId,
        userEmail: dto.userEmail,
        labTemplateId: dto.labTemplateId,
        labName: dto.labName,
        amount: dto.amount,
        status: 'SUCCESS',
      },
    });
  }

  async getHistory(userId: string) {
    return this.prisma.transaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async checkPurchased(userId: string, labTemplateId: string) {
    const txn = await this.prisma.transaction.findFirst({
      where: {
        userId,
        labTemplateId,
        status: 'SUCCESS',
      },
    });
    return !!txn;
  }

  async getAllPayments() {
    return this.prisma.transaction.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }
}
