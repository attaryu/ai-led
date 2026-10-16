import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { TriggerSetorLedDto } from './trigger-setor-led.dto';

const iku = { kode: 'IKU.REL.MHS.3', indikator: 'Rata-rata minimal IPK lulusan', target: '3' };

async function errorsFor(plain: unknown) {
  return validate(plainToInstance(TriggerSetorLedDto, plain), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
}

describe('TriggerSetorLedDto', () => {
  it('accepts one valid IKU', async () => {
    expect(await errorsFor({ ikuList: [iku] })).toHaveLength(0);
  });

  it('rejects a missing or empty ikuList', async () => {
    expect(await errorsFor({})).not.toHaveLength(0);
    expect(await errorsFor({ ikuList: [] })).not.toHaveLength(0);
  });

  it('rejects an IKU with a missing field', async () => {
    expect(await errorsFor({ ikuList: [{ kode: 'X', indikator: 'Y' }] })).not.toHaveLength(0);
  });

  it('rejects whitespace-only kode/indikator/target', async () => {
    for (const field of ['kode', 'indikator', 'target'] as const) {
      const errors = await errorsFor({ ikuList: [{ ...iku, [field]: '   ' }] });
      expect(errors).not.toHaveLength(0);
    }
  });

  it('accepts every target from 0 to 4', async () => {
    for (const target of ['0', '1', '2', '3', '4']) {
      expect(await errorsFor({ ikuList: [{ ...iku, target }] })).toHaveLength(0);
    }
  });

  it('rejects a target that is not a 0-4 integer', async () => {
    for (const target of ['5', '-1', '3.5', '03', 'tiga', 'PJJ: RIPK ≥ 3,25', '3,5 < MS ≤ 4,5']) {
      expect(await errorsFor({ ikuList: [{ ...iku, target }] })).not.toHaveLength(0);
    }
  });

  it('trims the target before checking it', async () => {
    const dto = plainToInstance(TriggerSetorLedDto, { ikuList: [{ ...iku, target: ' 4 ' }] });
    expect(dto.ikuList[0].target).toBe('4');
    expect(await errorsFor({ ikuList: [{ ...iku, target: ' 4 ' }] })).toHaveLength(0);
  });

  it('rejects unknown properties', async () => {
    expect(await errorsFor({ ikuList: [iku], bogus: 1 })).not.toHaveLength(0);
  });

  it('caps ikuList at 200 items (each IKU spawns an LLM task and lands in the job payload)', async () => {
    const banyak = (n: number) => Array.from({ length: n }, (_, i) => ({ ...iku, kode: `IKU.${i}` }));
    expect(await errorsFor({ ikuList: banyak(200) })).toHaveLength(0);
    expect(await errorsFor({ ikuList: banyak(201) })).not.toHaveLength(0);
  });

  it('rejects an invalid sumberLed', async () => {
    expect(await errorsFor({ ikuList: [iku], sumberLed: 'NGAWUR' })).not.toHaveLength(0);
  });
});
