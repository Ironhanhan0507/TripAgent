import { Logger, Module } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service.js';
import { LlmModule } from '../llm/llm.module.js';
import { PLACES_PROVIDER, PlacesProvider } from './places/places-provider.types.js';
import { AmapPlacesProvider } from './places/amap-places.provider.js';
import { MockPlacesProvider } from './places/mock-places.provider.js';
import { Planner } from './planner.service.js';
import { Validator } from './validator.service.js';

// 规划引擎模块。PlacesProvider 可插拔：PLACES_PROVIDER=mock（离线确定性数据）
// 或 amap（高德 Web服务 API，真实 POI / 交通 / 营业时间）。
@Module({
  imports: [LlmModule],
  providers: [
    MockPlacesProvider,
    AmapPlacesProvider,
    {
      provide: PLACES_PROVIDER,
      inject: [AppConfigService, MockPlacesProvider, AmapPlacesProvider],
      useFactory: (
        config: AppConfigService,
        mock: MockPlacesProvider,
        amap: AmapPlacesProvider,
      ): PlacesProvider => {
        if (config.placesProvider === 'amap') {
          if (!config.amapApiKey) {
            throw new Error('PLACES_PROVIDER=amap 需要配置 AMAP_API_KEY（高德 Web服务 Key）');
          }
          return amap;
        }
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
