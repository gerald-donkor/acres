import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AcresConfigService } from './acres-config.service';
import { validateEnv } from './env.validation';

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: ['.env'],
      validate: validateEnv,
    }),
  ],
  providers: [AcresConfigService],
  exports: [AcresConfigService],
})
export class AcresConfigModule {}
