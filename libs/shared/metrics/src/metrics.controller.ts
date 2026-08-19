import { Controller } from "@nestjs/common";
import { PrometheusController } from "@willsoto/nestjs-prometheus";
import { Public } from "@shared/rbac";

@Controller("metrics")
@Public()
export class MetricsController extends PrometheusController {}
