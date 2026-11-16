// Single source of truth for the wish form: GitHub issue form, body parser, labels and the map.
// All Georgian copy for the form lives here.

export const OWNER = "SmartTransportationSolutions";
export const WISHLIST_REPO = "wishlist";
export const MAP_URL = "https://smarttransportationsolutions.github.io/wishmap/";
export const REPO_URL = `https://github.com/${OWNER}/${WISHLIST_REPO}`;
export const NEW_WISH_URL = `${REPO_URL}/issues/new?template=wish.yml`;

export const FORM_NAME = "სურვილი";
export const FORM_DESCRIPTION = "დაამატე სურვილი: რა გინდა, რომ ავტომატიზდეს ან გაკეთდეს";
export const TITLE_PREFIX = "[სურვილი] ";
// Issue titles start with the form's prefix; show them without it.
export function displayTitle(title) {
  const t = String(title ?? "").trim();
  const p = TITLE_PREFIX.trim();
  return t.startsWith(p) ? t.slice(p.length).trim() || t : t;
}

export const HEADER = (mapUrl) => `⚠️ ჯერ შეამოწმე რუკა — იქნებ ვინმეს უკვე იგივე სურს: ${mapUrl}`;

export const AREAS = [
  { slug: "traffic", label: "მოძრაობის მონაცემები და აღრიცხვა" },
  { slug: "modelling", label: "მოდელირება" },
  { slug: "gis", label: "GIS და რუკები" },
  { slug: "reporting", label: "ანგარიშგება და დოკუმენტები" },
  { slug: "web", label: "ვებ და CMS" },
  { slug: "data", label: "მონაცემები და ბაზები" },
  { slug: "admin", label: "ადმინისტრაცია და ფინანსები" },
  { slug: "other", label: "სხვა" },
];

export const TIMES = [
  { slug: "lt1h", label: "< 1 სთ კვირაში" },
  { slug: "1-5h", label: "1–5 სთ კვირაში" },
  { slug: "5h+", label: "5+ სთ კვირაში" },
  { slug: "rare", label: "იშვიათად, მაგრამ მტკივნეულად" },
];

export const STARTED = { no: "არა, მხოლოდ სურვილია", yes: "კი, დავიწყე — ჩემზეა" };

export const FIELDS = [
  {
    id: "problem",
    type: "textarea",
    required: true,
    label: "რა პრობლემაა დღეს? (რას აკეთებ ხელით, რა გაწუხებს)",
    placeholder: "მაგ.: ყოველ ორშაბათს ხელით ვაერთიანებ 5 Excel ფაილს მოძრაობის აღრიცხვიდან…",
  },
  {
    id: "done",
    type: "textarea",
    required: true,
    label: "როგორ გამოიყურება „მზადაა“?",
    placeholder: "მაგ.: ანგარიში თავისით მზადდება და ორშაბათ დილით ფოსტაზე მოდის",
  },
  { id: "area", type: "dropdown", required: true, label: "სფერო", options: AREAS },
  { id: "time", type: "dropdown", required: true, label: "რამდენ დროს გართმევს?", options: TIMES },
  {
    id: "tools",
    type: "input",
    required: false,
    label: "ინსტრუმენტები / მონაცემები (Excel, Visum, QGIS…)",
    placeholder: "მაგ.: Excel, PTV Visum, QGIS, Python",
  },
  {
    id: "started",
    type: "dropdown",
    required: false,
    label: "უკვე მუშაობ ამაზე?",
    options: [
      { slug: "no", label: STARTED.no },
      { slug: "yes", label: STARTED.yes },
    ],
  },
];

const q = (s) => `"${String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

export function renderFormYaml({ mapUrl }) {
  const out = [
    `name: ${q(FORM_NAME)}`,
    `description: ${q(FORM_DESCRIPTION)}`,
    `title: ${q(TITLE_PREFIX)}`,
    `labels: ["wish"]`,
    `body:`,
    `  - type: markdown`,
    `    attributes:`,
    `      value: ${q(HEADER(mapUrl))}`,
  ];
  for (const f of FIELDS) {
    out.push(`  - type: ${f.type}`, `    id: ${f.id}`, `    attributes:`, `      label: ${q(f.label)}`);
    if (f.placeholder) out.push(`      placeholder: ${q(f.placeholder)}`);
    if (f.options) {
      out.push(`      options:`);
      for (const o of f.options) out.push(`        - ${q(o.label)}`);
    }
    out.push(`    validations:`, `      required: ${f.required ? "true" : "false"}`);
  }
  return out.join("\n") + "\n";
}
