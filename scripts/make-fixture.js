// Generates test/fixtures/mapdata.json: a realistic, made-up MapData for local visual checks.
import { writeFileSync } from "node:fs";

const P = "ხელით ვაკეთებთ ყოველ ჯერზე — ბევრ დროს ართმევს გუნდს და შეცდომებიც ხდება.";
const D = "ავტომატურად ხდება და შედეგი ერთ ადგილას ჩანს.";
const rows = [
  // n, title, area, time, status, people, needs, project, owner, mergedFrom, tools
  [1, "მოძრაობის აღრიცხვის ვიდეოების ავტომატური დამუშავება", "traffic", "5h+", "in-progress", ["ana", "gio", "nino", "lasha", "tamar"], [], 101, "gio", [], "Python, OpenCV"],
  [2, "Excel-ის აღრიცხვის ფაილების გაერთიანება ერთ ბაზაში", "data", "1-5h", "planned", ["nino", "ana", "eka"], [], 101, null, [9], "Excel, PostgreSQL"],
  [3, "ყოველკვირეული ანგარიშის ავტომატური გენერირება", "reporting", "1-5h", "idea", ["tamar", "zuka", "mari", "dato"], [2], null, null, [], "Word, Excel"],
  [4, "Visum-ის მოდელის შედეგების ექსპორტი GIS-ში", "modelling", "1-5h", "idea", ["levan", "ana"], [2], null, null, [], "PTV Visum, QGIS"],
  [5, "QGIS-ის რუკების შაბლონები კლიენტის ანგარიშებისთვის", "gis", "lt1h", "planned", ["eka", "nino"], [], 102, null, [], "QGIS"],
  [6, "პარკირების მონაცემების ინტერაქტიული რუკა", "gis", "rare", "idea", ["zuka", "lasha", "gio"], [5], 102, null, [], "QGIS, Leaflet"],
  [7, "ვებგვერდზე პროექტების ავტომატური განახლება", "web", "lt1h", "done", ["mari"], [], null, "mari", [], "CMS"],
  [8, "ინვოისების შედგენა დროის აღრიცხვიდან", "admin", "5h+", "idea", ["dato", "eka", "zuka", "tamar", "nino", "ana"], [], null, null, [], "Excel"],
  [10, "მიკრომოდელირების სცენარების ავტომატური გაშვება", "modelling", "5h+", "in-progress", ["levan", "gio"], [], 103, "levan", [], "PTV Vissim, Python"],
  [11, "სცენარების შედარების დაფა", "modelling", "1-5h", "idea", ["levan", "tamar", "zuka"], [10], 103, null, [], ""],
  [12, "სატრანსპორტო ნაკადების ვიზუალიზაცია ვებზე", "web", "rare", "idea", ["gio"], [4], null, null, [], "D3"],
  [13, "GPS-ტრეკების გასუფთავება და იმპორტი", "traffic", "1-5h", "planned", ["ana", "lasha"], [], 101, "ana", [], "Python"],
  [14, "საველე ფორმები ტაბლეტზე აღრიცხვისთვის", "traffic", "1-5h", "idea", ["lasha", "nino", "gio"], [], null, null, [], ""],
  [15, "კლიენტის პრეზენტაციების შაბლონი", "reporting", "lt1h", "wont-do", ["mari"], [], null, null, [], "PowerPoint"],
  [16, "დოკუმენტების ვერსიების კონტროლი", "admin", "lt1h", "idea", ["eka"], [], null, null, [], ""],
  [17, "პროექტის ბიუჯეტის ტრეკერი", "admin", "1-5h", "idea", ["dato", "zuka"], [8], null, null, [], "Excel"],
  [18, "მოძრაობის მონაცემების API კლიენტებისთვის", "data", "rare", "idea", ["gio", "zuka"], [2], null, null, [], ""],
  [19, "ავტომატური შეხსენებები ვადებზე", "admin", "lt1h", "done", ["tamar", "mari"], [], null, "tamar", [], "Google Calendar"],
  [20, "ფოტოების გეოტეგირება საველე სამუშაოებიდან", "gis", "lt1h", "idea", ["nino"], [], null, null, [], ""],
  [21, "ანგარიშების თარგმნა ინგლისურად", "reporting", "1-5h", "idea", ["mari", "tamar", "eka"], [3], null, null, [], ""],
  [22, "მოდელის კალიბრაციის შემოწმების სკრიპტი", "modelling", "1-5h", "planned", ["levan"], [], 103, null, [], "Python"],
  [23, "საზოგადოებრივი ტრანსპორტის განრიგების (GTFS) იმპორტი", "data", "1-5h", "idea", ["gio", "levan", "ana"], [], null, null, [], "GTFS"],
  [24, "ავარიების მონაცემების ანალიზი", "traffic", "rare", "idea", ["lasha"], [], null, null, [], ""],
];

const wishes = rows.map(([n, title, area, time, status, people, needs, project, owner, mergedFrom, tools]) => ({
  n, title, url: `https://github.com/SmartTransportationSolutions/wishlist/issues/${n}`,
  problem: P, done: D, tools, area, time, status, owner, people, mergedFrom, needs, neededBy: [], project,
  createdAt: "2026-11-10T09:00:00Z",
}));
for (const w of wishes) for (const n of w.needs) wishes.find((x) => x.n === n).neededBy.push(w.n);

const logins = [...new Set(wishes.flatMap((w) => w.people))];
const data = {
  v: 1,
  generatedAt: new Date(Date.now() - 4 * 60000).toISOString(),
  newWishUrl: "https://github.com/SmartTransportationSolutions/wishlist/issues/new?template=wish.yml",
  repoUrl: "https://github.com/SmartTransportationSolutions/wishlist",
  wishes,
  projects: [
    { n: 101, title: "მოძრაობის მონაცემების ჰაბი", url: "https://github.com/SmartTransportationSolutions/wishlist/issues/101", status: "in-progress", tasks: { done: 3, total: 7 } },
    { n: 102, title: "GIS რუკების ნაკრები", url: "https://github.com/SmartTransportationSolutions/wishlist/issues/102", status: "planned", tasks: { done: 0, total: 4 } },
    { n: 103, title: "მოდელირების ავტომატიზაცია", url: "https://github.com/SmartTransportationSolutions/wishlist/issues/103", status: "in-progress", tasks: { done: 2, total: 5 } },
  ],
  people: Object.fromEntries(logins.map((l) => [l, { avatar: "" }])),
};
writeFileSync(new URL("../test/fixtures/mapdata.json", import.meta.url), JSON.stringify(data, null, 1));
console.log(`fixture: ${wishes.length} wishes, ${data.projects.length} projects, ${logins.length} people`);
