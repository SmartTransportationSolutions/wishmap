// Georgian texts posted by the bot. Keep all bot copy here for native-speaker review.
import { marker, neutralize as safe } from "./markers.js";

export const HELP = [
  "**ბრძანებები** (დაწერე კომენტარში, თითო ხაზზე):",
  "- `/same-as #12` — ეს იგივეა, რაც #12 (დაიხურება როგორც დუბლიკატი, შენი ხმა იქ გადავა)",
  "- `/not-same #12` — ეს არ არის იგივე (ან გააუქმე შეცდომით გაერთიანება)",
  "- `/needs #12` — ამას ჯერ #12 სჭირდება",
  "- `/unneed #12` — ეს კავშირი მოხსენი",
  "- `/claim` — მე ვმუშაობ ამაზე",
  "- `/unclaim` — აღარ ვმუშაობ ამაზე",
  "- `/status idea|planned|in-progress|done|wont-do` — მხოლოდ wishlist-leads გუნდისთვის",
].join("\n");

const RELATION = { "same-as": "იგივე ჩანს", needs: "შეიძლება დამოკიდებული იყოს", related: "მსგავსია" };

export function relatedComment(items) {
  const lines = items.map((it) => {
    let line = `- #${Number(it.n)} — ${safe(it.title)}`;
    if (it.relation) line += ` (${RELATION[it.relation] || RELATION.related})`;
    if (it.reason) line += ` — ${safe(it.reason)}`;
    else if (it.shared && it.shared.length) line += ` (საერთო: ${it.shared.map(safe).join(", ")})`;
    return line;
  });
  const first = items[0]?.n ?? 12;
  return [
    "🔎 **შესაძლოა უკვე არსებობს მსგავსი სურვილი:**",
    "",
    ...lines,
    "",
    `თუ იგივეა, დაწერე კომენტარი \`/same-as #${first}\` — შენი ხმა იქ ჩაითვლება.`,
    `თუ განსხვავებულია: \`/not-same #${first}\` — მეტად აღარ შემოგთავაზებ.`,
    `თუ ეს სურვილი მასზეა დამოკიდებული: \`/needs #${first}\`.`,
    "",
    marker("related"),
  ].join("\n");
}

export function noRelatedNow() {
  return ["✅ ცვლილების შემდეგ მსგავსი სურვილი აღარ ჩანს.", "", marker("related")].join("\n");
}

export function sameAsNote(n) {
  return [`🔁 დუბლიკატია #${n}-ის — შენი ხმა იქ ჩაითვალა. თუ შეცდომაა: \`/not-same #${n}\`.`, "", marker("same-as", n)].join("\n");
}

export function notSameNote(n) {
  return [`↩️ #${n}-თან აღარ დავაკავშირებ.`, "", marker("not-same", n)].join("\n");
}

const ERR = {
  unknown: (e) => `უცნობი ბრძანება: \`${safe(e.raw ?? e.cmd).replace(/`/g, "'")}\``,
  "not-found": (e) => `#${e.n} ვერ ვიპოვე.`,
  "not-a-wish": (e) => `#${e.n} სურვილი არ არის (არ აქვს \`wish\` იარლიყი).`,
  self: () => "სურვილს საკუთარ თავთან ვერ დავაკავშირებ.",
  loop: (e) => `ეს წრეს შექმნიდა: #${e.n} უკვე ამ სურვილთან არის დაკავშირებული.`,
  "not-lead": () => "`/status`-ის შეცვლა მხოლოდ wishlist-leads გუნდს შეუძლია.",
  "bad-status": () => "სტატუსი უნდა იყოს: idea, planned, in-progress, done ან wont-do.",
  closed: (e) => `#${e.n} დახურულია.`,
  failed: (e) => `\`/${e.cmd}\` ვერ შესრულდა — სცადე თავიდან ცოტა ხანში.`,
};

export function errorsReply(errors) {
  const lines = ["😕 ზოგი ბრძანება ვერ შესრულდა:", "", ...errors.map((e) => `- ${(ERR[e.code] || ERR.failed)(e)}`)];
  if (errors.some((e) => e.code === "unknown")) lines.push("", HELP);
  return lines.join("\n");
}
