import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { CreateSystemDeviceModelDto } from '../../../apps/auth/src/dto/create-system-device-model.dto';

// @IsEnum() builds its message from Object.keys(), which on a const array is
// "0","1","2" — all numeric, all filtered out. The allowlist came back empty,
// so a rejected payload never said which values were valid.
describe('Enum validation messages', () => {
  it('names the values it will accept', () => {
    const errors = validateSync(
      plainToInstance(CreateSystemDeviceModelDto, {
        manufacturer: 'Teltonika',
        model: 'FMC150',
        protocolType: 'TCP',
        defaultPort: 5027,
        supportedFeatures: ['OBD-II'],
        status: 'supported',
      }),
    );

    const message = Object.values(errors.find((e) => e.property === 'supportedFeatures')!.constraints!)[0];
    expect(message).toContain('obd2');
    expect(message).toContain('fuel');
    expect(message).toContain('sos');
  });

  it('still accepts the valid values', () => {
    const errors = validateSync(
      plainToInstance(CreateSystemDeviceModelDto, {
        manufacturer: 'Teltonika',
        model: 'FMC150',
        protocolType: 'TCP',
        defaultPort: 5027,
        supportedFeatures: ['obd2', 'fuel', 'sos'],
        status: 'supported',
      }),
    );
    expect(errors).toHaveLength(0);
  });
});
