import { Module } from '@nestjs/common';
import { DummyAdapter } from './dummy.adapter';

@Module({
  providers: [DummyAdapter],
  exports: [DummyAdapter],
})
export class DummyModule {}
