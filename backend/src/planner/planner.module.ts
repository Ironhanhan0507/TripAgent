import { Logger, Module } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service.js';
import { LlmModule } from '../llm/llm.module.js';
import { PLACES_PROVIDER, PlacesProvider } from './places/places-provider.types.js';
import { MockPlacesProvider } from './places/mock-places.provider.js';
import { Planner } from './planner.service.js';
import { Validator } from './validator.service.js';

// 规划引擎模块。PlacesProvider 可插拔：默认 Mock（离线确定性数据），
// 接入真实服务（如 Google Places）后按 PLACES_PROVIDER 环境变量切换实现。
@Module({
  imports: [LlmModule],
  providers: [
    MockPlacesProvider,
    {
      provide: PLACES_PROVIDER,
      inject: [AppConfigService, MockPlacesProvider],
      useFactory: (config: AppConfigService, mock: MockPlacesProvider): PlacesProvider => {
        if (config.placesProvider !== 'mock') {
          new Logger('PlacesProvider').warn(
            `PLACES_PROVIDER=${config.placesProvider} 尚无实现，回退 Mock（离线确定性数据）。`,
          );
        }
        return mock;
      },
    },
    Planner,
    Validator,
  ],
  exports: [Planner, Validator, PLACES_PROVIDER],
})
export class PlannerModule {}
