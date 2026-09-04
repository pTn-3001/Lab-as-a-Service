import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { GuacamoleController } from './guacamole.controller';
import { GuacamoleService } from './guacamole.service';

@Module({
  imports: [HttpModule],
  controllers: [GuacamoleController],
  providers: [GuacamoleService],
  exports: [GuacamoleService],
})
export class GuacamoleModule {}
