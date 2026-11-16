// Regenerate templates/wish.yml from site/shared/form-schema.js.
// Copy the result to wishlist/.github/ISSUE_TEMPLATE/wish.yml after changing the schema.
import { writeFileSync } from "node:fs";
import { MAP_URL, renderFormYaml } from "../site/shared/form-schema.js";

const target = new URL("../templates/wish.yml", import.meta.url);
writeFileSync(target, renderFormYaml({ mapUrl: MAP_URL }));
console.log("wrote templates/wish.yml");
