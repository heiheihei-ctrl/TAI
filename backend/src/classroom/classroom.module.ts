import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PaymentModule } from '../payment/payment.module';
import { AuthModule } from '../auth/auth.module';
import { ClassroomController } from './classroom.controller';
import { ClassroomService } from './classroom.service';

@Module({
  imports: [PrismaModule, forwardRef(() => PaymentModule), AuthModule],
  controllers: [ClassroomController],
  providers: [ClassroomService],
  exports: [ClassroomService],
})
export class ClassroomModule {}
