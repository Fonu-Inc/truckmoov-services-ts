import { ArgumentMetadata, Injectable, PipeTransform } from "@nestjs/common";

@Injectable()
export class BodyOrDataPipe implements PipeTransform {
  transform(value: unknown, _metadata: ArgumentMetadata) {
    if (
      value &&
      typeof value === "object" &&
      "data" in value &&
      value.data &&
      typeof value.data === "object"
    ) {
      return value.data;
    }

    return value;
  }
}
