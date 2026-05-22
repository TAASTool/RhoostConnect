// Shared AFAS REST API helpers (server-side only — uses Buffer).
// Base URLs per environment, source:
// https://help.afas.nl/help/NL/SE/App_Conect_WebSrv_Addrss.htm

export const AFAS_HOST: Record<string, string> = {
  productie:  'rest.afas.online',
  test:       'resttest.afas.online',
  acceptatie: 'restaccept.afas.online',
};

export const AFAS_TOKEN_RE = /^<token><version>\d+<\/version><data>[A-Fa-f0-9]+<\/data><\/token>$/;

export interface AfasConfig {
  deelnemersnummer: string;
  omgeving: string;
  afasToken: string;
}

export function validateAfasConfig(c: Partial<AfasConfig>): string | null {
  if (!c.deelnemersnummer || !c.omgeving || !c.afasToken) return 'Onvolledige AFAS configuratie';
  if (!/^\d{5}$/.test(c.deelnemersnummer)) return 'Ongeldig deelnemersnummer';
  if (!AFAS_TOKEN_RE.test(c.afasToken.trim())) return 'Ongeldig token formaat';
  if (!AFAS_HOST[c.omgeving]) return `Onbekende omgeving: ${c.omgeving}`;
  return null;
}

export function afasBaseUrl(c: AfasConfig): string {
  return `https://${c.deelnemersnummer}.${AFAS_HOST[c.omgeving]}/ProfitRestServices`;
}

export function afasHeaders(c: AfasConfig): Record<string, string> {
  return {
    Authorization: `AfasToken ${Buffer.from(c.afasToken.trim()).toString('base64')}`,
    'Content-Type': 'application/json',
  };
}

export interface AfasConnectorEntry { id: string; description: string; }

export function toConnectorEntries(arr: unknown): AfasConnectorEntry[] {
  if (!Array.isArray(arr)) return [];
  return arr
    .map((c: unknown) => {
      const o = c as Record<string, unknown>;
      return {
        id:          String(o.id ?? o.Id ?? ''),
        description: String(o.description ?? o.Description ?? ''),
      };
    })
    .filter((e) => e.id);
}

export interface AfasField {
  id: string;        // path-qualified field id, e.g. "KnSubject/Sb"
  label: string;
  dataType: string;
  required: boolean;
}

// Recursively flatten the metainfo/update response into a flat field list.
// AFAS returns nested objects each with a `fields` array; required is
// signalled by mandatory/required/notNull depending on the connector.
export function flattenUpdateFields(meta: unknown): AfasField[] {
  const out: AfasField[] = [];
  const seen = new Set<string>();

  function walk(node: unknown, prefix: string) {
    if (!node || typeof node !== 'object') return;
    const n = node as Record<string, unknown>;

    const fields = Array.isArray(n.fields) ? n.fields : Array.isArray(n.Fields) ? n.Fields : [];
    for (const f of fields as Array<Record<string, unknown>>) {
      const id = String(f.fieldId ?? f.id ?? f.name ?? f.FieldId ?? '');
      if (!id) continue;
      const key = prefix ? `${prefix}/${id}` : id;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        id: key,
        label: String(f.label ?? f.description ?? f.Label ?? id),
        dataType: String(f.dataType ?? f.type ?? f.DataType ?? 'string'),
        required: Boolean(f.mandatory ?? f.required ?? f.notNull ?? f.Mandatory ?? false),
      });
    }

    const objects = Array.isArray(n.objects) ? n.objects : Array.isArray(n.Objects) ? n.Objects : [];
    for (const o of objects as Array<Record<string, unknown>>) {
      const name = String(o.name ?? o.id ?? o.type ?? '');
      walk(o, prefix ? `${prefix}/${name}` : name);
    }
  }

  walk(meta, '');
  return out;
}
