import { Migration } from '@mikro-orm/migrations';

const BRANDING_COLOR_KEYS = [
  'primaryColor',
  'secondaryColor',
  'accentColor',
  'successColor',
  'warningColor',
  'destructiveColor',
  'sidebarBackground',
  'sidebarText',
  'sidebarAccent',
];

export class Migration20260613120000 extends Migration {
  override async up(): Promise<void> {
    for (const key of BRANDING_COLOR_KEYS) {
      this.addSql(
        `update "auth_organization_settings" set "branding" = jsonb_set("branding", '{${key}}', jsonb_build_object('dark', "branding"->>'${key}', 'light', "branding"->>'${key}')) where jsonb_typeof("branding"->'${key}') = 'string';`,
      );
    }
  }

  override async down(): Promise<void> {
    for (const key of BRANDING_COLOR_KEYS) {
      this.addSql(
        `update "auth_organization_settings" set "branding" = jsonb_set("branding", '{${key}}', to_jsonb("branding"->'${key}'->>'dark')) where jsonb_typeof("branding"->'${key}') = 'object';`,
      );
    }
  }
}
