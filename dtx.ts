import { readFile } from "fs";
import { join } from "path";

import { Parser } from "binary-parser";

const header = new Parser()
  .endianness("little")
  .string("type", {
    length: 5,
    assert: " 8H39",
  });

const parser = new Parser()
  .nest("fileHeader", {
    type: header,
  });

readFile(join(__dirname, "F.MTA"), (_, data) => {
  console.log(parser.parse(data));
});
