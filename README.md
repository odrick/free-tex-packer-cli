# free-tex-packer-cli

[![Stats](https://nodei.co/npm/free-tex-packer-cli.png?downloads=true&stars=true)](https://www.npmjs.com/package/free-tex-packer-cli)

Command line interface of [Free texture packer](https://github.com/odrick/free-tex-packer). It packs the images of a
Free texture packer project (`.ftpp`) into a sprite sheet and writes the texture and the data file.

Web version of the app: https://odrick.github.io/free-tex-packer/

# Requirements

Node.js 20.9 or newer.

# Install

```
$ npm install -g free-tex-packer-cli
```

# Usage

```
$ free-tex-packer-cli --project /path/to/project.ftpp --output /path/to/output/folder
```

| option      | description                                                                                       |
| ---         | ---                                                                                               |
| `--project` | path to the project file (create it with the Free texture packer desktop app)                     |
| `--output`  | folder for the result; by default the `savePath` of the project, or the folder of the project file |
| `--help`    | show the usage                                                                                    |
| `--version` | show the version                                                                                  |

The output folder is created if it does not exist. The custom exporter is not supported by the CLI.

Images can be PNG, JPEG or WebP. Project folders are scanned for `.png`, `.jpg`, `.jpeg` and `.webp` files (other files are
ignored); images listed in the project are loaded as they are. The texture format (`png`, `jpg` or `webp`) is set in the
project's pack options.

# Exit code

* `0` - the sprite sheet was written
* `1` - something went wrong; the reason is printed to stderr and **nothing is written**. This includes a missing or
  invalid project file, an image or a folder of the project that does not exist, a file that is not a valid image,
  and a packing error

So a build script can rely on the exit code: a sprite sheet is never produced with missing sprites.

# Used libs

* **Free texture packer core** - https://github.com/odrick/free-tex-packer-core

---
License: MIT
