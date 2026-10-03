---
title: Tools
nav_order: 7
description: "Three small Python scripts behind our Dauntless analysis: xref.py for PE string cross-references, utocdir.py for IoStore, pak9.py for pak v9, plus libooz."
lang: en
ref: tools
---

{% assign crashes_page = site.pages | where: "path", "findings/crashes.md" | first %}
{% assign awakening_page = site.pages | where: "path", "findings/awakening-2-1-1.md" | first %}
{% assign contract_page = site.pages | where: "path", "findings/backend-contract.md" | first %}
{% assign scripts_page = site.pages | where: "path", "reference/scripts.md" | first %}

# Tools
{: .no_toc }

Much of the static analysis on this site was done with three small Python scripts. None of them is
clever. They exist because the usual tools either did not know these formats or could not open
these files.

| Script | What it reads | Build |
|---|---|---|
| [`xref.py`](#xrefpy-string-cross-references-and-annotated-disassembly) | A Windows PE executable: finds code that references a string, and disassembles with string annotations | Both (most addresses on this site came from it) |
| [`utocdir.py`](#utocdirpy-the-iostore-directory-index) | The directory index of an Unreal 5 IoStore `.utoc` container | 2.1.1 |
| [`pak9.py`](#pak9py-legacy-pak-v8v9-reader) | An Unreal 4 `.pak` (version 8 or 9) with a legacy index: list, search, extract | 1.4.4 |

<details open markdown="block">
  <summary>Contents</summary>
  {: .text-delta }
1. TOC
{:toc}
</details>

---

## Licence and ground rules

- The scripts are released under the **GNU Affero General Public License v3.0 (AGPL-3.0)**,
  together with our fork of Undaunted. **Status:** they are not in the repository yet; we plan to
  add them in a `tools/` folder. The `tools/` folder that exists today holds the project's own build
  and packaging scripts, not these; they are listed in
  [Scripts and parameters]({{ scripts_page.url | relative_url }}).
- **Only point them at files you own:** your own, legally obtained copy of the game. They only read
  the game's files and never modify them (`pak9.py get` writes the one file you extract to the
  output path you give it). They include no game data, keys or other secrets.
- They do not defeat protection. `pak9.py` refuses an encrypted or "frozen" index. `utocdir.py`
  expects an unencrypted directory index. Dauntless 1.4.4 and 2.1.1 ship both unencrypted.
- Do not publish what you extract. Game files, assets and cooked config belong to their owners. The
  shipped config also contains live credentials (see
  [Backend contract]({{ contract_page.url | relative_url }})).

## Requirements

- Python 3. We ran everything under Ubuntu in WSL, but nothing in the scripts is Linux-specific
  except the Oodle library path.
- `xref.py`: the `pefile` and `capstone` packages (`pip install pefile capstone`).
- `utocdir.py`: nothing beyond the standard library.
- `pak9.py`: the standard library for zlib paks. For Oodle-compressed paks, a shared library built
  from [ooz](https://github.com/powzix/ooz). See [Oodle](#oodle-building-libooz) below.

In the examples, `<exe>` is `Archon/Binaries/Win64/Dauntless-Win64-Shipping.exe` and `<paks>` is
`Archon/Content/Paks` inside your game folder.

---

## `xref.py`: string cross-references and annotated disassembly

A shipping Unreal build has no symbols, but it is full of log format strings, config key names and
UObject names. Most functions contain at least one. `xref.py` gets you from a string to the code
that uses it, and from an address to readable disassembly.

```text
xref.py <exe> find <text>               locate a string and every lea that points at it
xref.py <exe> func <hex address> [n]    disassemble from an address, annotating string references
```

### `find`

It searches every section of the PE for the text, both as ASCII and as UTF-16LE (Unreal's `TEXT()`
strings are UTF-16). For each hit, it scans `.text` for RIP-relative `lea` instructions (`48 8D` or
`4C 8D` with a RIP-relative operand) whose target is that address. For each one it prints the
instruction address and an estimated start of the containing function (`func~`), found by walking
back to the nearest run of `int3` padding. Both examples below are from the 2.1.1 exe.

```console
$ python3 xref.py <exe> find "Trying to resize TArray"
[utf16] .rdata 0x146efffe0
    xref 0x142e8311d   func~0x142e83100
    xref 0x142e83150   func~0x142e83140
```

### `func`

It disassembles from a virtual address with Capstone. Every RIP-relative `lea` is annotated with the
string it points at: `w"..."` for UTF-16, `a"..."` for ASCII, or the raw target address if it is not
a string. It stops at the first `ret`. The optional count (default 400) does not limit the number of
instructions exactly: it reads count × 12 bytes of code and disassembles all of it, so treat it as
a rough limit.

```console
$ python3 xref.py <exe> func 0x1428cd7e0 8
0x1428cd7e0  mov     ebx, dword ptr [rdx + 0x108]
0x1428cd7e6  lea     r14, [rcx + 0x728]
0x1428cd7ed  add     ebx, dword ptr [rdx + 0x110]
0x1428cd7f3  jns     0x1428cd7fc
0x1428cd7f5  mov     ecx, ebx
0x1428cd7f7  call    0x140c0a6a0
...
```

That is the faulting code of the TArray crash described on
[Crash forensics]({{ crashes_page.url | relative_url }}). The same page shows how to turn a crash
report's offsets into addresses you can pass to `func`.

### How we use it

1. Find a log string, config key or UObject name that belongs to the behaviour you care about, for
   example `"[%s] - Loading PlayerData Failed"` or `"GameDefaultMap"`. Use the start of the string
   (see [Limits](#limits)).
2. `find` it and pick the function the `lea` sits in.
3. `func` that function. The string annotations usually name the function itself, because Unreal
   code logs its own name. In `0x1427d47a0`, for example, `a"UPlayerJourneyComponent::OnQueryPlayerJourneyDataComplete"`
   sits next to `w"%s - Succeeded: %s"`.
4. Follow `call` targets with more `func` calls.

Most function names on this site were found this way. They are our identifications, not symbols.

### Limits

- It only follows `lea`. References through `mov` of a pointer, through pointer tables, or through
  Unreal's `FName` table are not found. Config keys are often read through tables.
- The `lea` has to point at the first character of your match. Search for the beginning of a string.
  On 2.1.1, `"Loading PlayerData Failed"` finds the text but no xref, because the code points at
  `"[%s] - Loading PlayerData Failed! ..."`.
- The function start is a heuristic, hence `func~`. Check it before you rely on it.
- It uses the PE's preferred image base (`0x140000000` for both Dauntless builds). Addresses in a
  live process or a crash report are relocated. Subtract the module base and add `0x140000000`.

---

## `utocdir.py`: the IoStore directory index

On **2.1.1**, 141 of the `.pak` files are 339-byte stubs. The real content lives in Unreal 5 IoStore
containers: a `.utoc` table of contents and a `.ucas` data file. We only needed the file names, so
we wrote a reader for just the directory index.

It checks the `.utoc` magic and reads the header. It then skips the chunk ids, offsets and lengths,
the perfect-hash seeds and overflow list, the compression blocks and method names, and the
signature block if the container is signed. What is left is the directory index: the mount point, a tree of directory and file entries,
and a string table. It walks the tree and prints one path per file. It extracts nothing.

```console
$ python3 utocdir.py <paks>/Archon_0-WindowsClient.utoc | head -2
ver=5 entries=11349 flags=0x9 dirIndex=647462 at 0x6428e
../../../Archon/Content/bugbear_blaze_bb.uasset
../../../Archon/Content/Boar_loot_table.uasset
```

The header summary goes to stderr, the paths to stdout. To search every container:

```console
$ for f in <paks>/*.utoc; do python3 utocdir.py "$f" 2>/dev/null | sed "s|^|$(basename "$f")  |"; done \
    | grep -i ramsgate_01_persistent
Archon_Maps_2-WindowsClient.utoc  ../../../Archon/Content/Maps/ramsgate/ramsgate_01_persistent.umap
```

`../../../Archon/Content/` corresponds to `/Game/`, so that file is the package
`/Game/Maps/ramsgate/ramsgate_01_persistent`. That is the path we needed to boot 2.1.1 straight into
Ramsgate (see [The 2.1.1 standalone attempt]({{ awakening_page.url | relative_url }})).

### Limits

- Names only. It does not read chunks out of the `.ucas`.
- It assumes an unencrypted directory index (the `Encrypted` flag, `0x2`, clear). On an encrypted
  container its output is garbage. It does not check for this.
- It assumes the container has a directory index (the `Indexed` flag, `0x8`). 2.1.1's
  `global.utoc` has none, and the script stops there with a `struct.error`. The search loop above
  hides that with `2>/dev/null`.
- Tested only on Dauntless 2.1.1's containers (TOC version 5).

---

## `pak9.py`: legacy pak v8/v9 reader

**1.4.4** uses classic Unreal 4 paks, version 9, with an unencrypted legacy (not "frozen") index,
compressed with zlib. `pak9.py` reads exactly that.

```text
pak9.py list <pak>                 every file: uncompressed size, compression method index, path
pak9.py find <dir> <regex>         search the file lists of every *.pak in a directory
pak9.py get  <pak> <path> <out>    extract one file (stored, zlib or Oodle)
```

It finds the pak footer by searching the last 512 bytes for the magic `0x5A6F12E1`. From the footer
it reads the version, the index offset and size, the encrypted-index flag, the frozen-index flag
(version 9) and the five compression method names. It refuses an encrypted or frozen index. It then
parses each index entry (offsets, sizes, compression method, compression blocks, flags and block
size). `get` matches the path without regard to case and decompresses block by block.

```console
$ python3 pak9.py find <paks> 'DefaultGame\.ini$'
Archon_35-WindowsClient.pak      50377  ../../../Archon/Config/DefaultGame.ini

$ python3 pak9.py list <paks>/Archon_35-WindowsClient.pak | head -2
mount: ../../../Archon/  methods: ['Zlib']
      7612 cm=1 Content/World/ice/materials/ice_00_m.uasset

$ python3 pak9.py get <paks>/Archon_35-WindowsClient.pak Config/DefaultGame.ini DefaultGame.ini
wrote DefaultGame.ini (50377 bytes, Zlib)
```

Paths in `list` and `get` are relative to the mount point. `find` prints them with the mount point
in front.

### Known issue: the Oodle branch

`pak9.py` calls a function named `Kraken_Decompress` in the Oodle library. Our library build (below)
exports it only under a C++-mangled name, plus a plain C wrapper, `ooz_decompress`. As written, the
Oodle branch therefore fails with an `AttributeError`. We have only run `pak9.py` on 1.4.4, whose paks
use zlib or no compression at all, so we never hit it. Fix: call `ooz_decompress` instead, which takes the same four
arguments (source, source length, destination, destination length) and returns the number of bytes
written. Our 2.1.1 extraction scripts already did it that way.

---

## Oodle: building `libooz`

The **2.1.1** config pak, `Archon_50-WindowsClient.pak`, is compressed with Oodle Kraken. The game
links Oodle statically and ships no `oo2core` DLL, so tools that borrow that DLL could not open it
for us. [ooz](https://github.com/powzix/ooz) is an open-source Kraken, Mermaid, Selkie, Leviathan,
LZNA and BitKnit decompressor. It is licensed GPL-3.0-or-later and is not part of our release. Get
it from its author.

ooz is a Windows project. To use it from Python on Linux we built a small shared library:

1. Copy `kraken.cpp`, `bitknit.cpp`, `lzna.cpp` and `stdafx.h` into a new folder.
2. In `kraken.cpp`, delete the end of the file, from the `OodLZ_*` function typedefs onward: the
   `oo2core` DLL loader and the command-line `main()`. Keep `Kraken_Decompress` and everything
   before it.
3. Replace `stdafx.h` with a POSIX version. It needs `<stdint.h>` fixed-width typedefs and the SSE
   intrinsic headers. Map `__forceinline` to GCC's always-inline attribute and define `WINAPI` as
   empty. Add small stand-ins for `_BitScanForward`, `_BitScanReverse`, `_rotl` and the
   `_byteswap_*` functions, built on the `__builtin_*` equivalents. `bitknit.cpp` and `lzna.cpp`
   include `stdafx.h` too, so they pick up the same header.
4. Add a C-linkage wrapper:

   ```cpp
   #include <stddef.h>
   typedef unsigned char byte;
   int Kraken_Decompress(const byte *src, size_t src_len, byte *dst, size_t dst_len);
   extern "C" int ooz_decompress(const unsigned char *src, size_t sl, unsigned char *dst, size_t dl) {
     return Kraken_Decompress(src, sl, dst, dl);
   }
   ```

5. Build it:

   ```console
   $ g++ -O2 -fPIC -shared -o libooz.so kraken.cpp bitknit.cpp lzna.cpp wrap.cpp
   ```

`pak9.py` loads the library from a fixed path, `/root/tools/oozlib/libooz.so`. Edit that line to
match where you put it.

ooz's own README warns that it is not fuzz-safe. Only feed it files you trust, which is one more
reason to use these tools on your own install and nothing else.
