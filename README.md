# Key Loading Device (KLD) Emulator

Key loading device (KLD) emulator is a single page application that emulating key exchange, key import and export as a key loading device. This project aim for simplify the integration testing between any system and KLD. For example, people can use this to test the crypto key flows during the development stage.

This webapp is designed for testing only and so means somehow it is not secured by default. So ...

**DON'T USE THIS FOR PRODUCTION**.

## Key Check Value (KCV)

The KCV shown and stored throughout the app is the first 3 bytes (6 hex digits) of:

- **AES keys** — `AES-CMAC` over a 16-byte all-zero block.
- **3DES keys** — ECB-encryption of an 8-byte all-zero block.

AES keys additionally carry an **EMV KCV**: the first 3 bytes of ECB-encrypting a
16-byte block of `0x01`. Where a CSV is verified against a KCV, an AES value is
accepted if it matches **either** the standard (CMAC) KCV or the EMV KCV.

## File Specifications

### Backup / Restore file (`.bak`)

A ZIP archive (extension `.bak`) bundling the whole app state:

| Entry         | Contents                                                                 |
| ------------- | ------------------------------------------------------------------------ |
| `keypair.pem` | The EC keypair in PKCS#8 PEM (omitted when no keypair exists).            |
| `zmks.csv`    | All Zone Master Keys, one per row.                                        |
| `keys.csv`    | All working keys, one per row.                                           |

Both CSVs share the header `ID,Type,KeyValue,KCV`:

- `ID` — numeric identifier.
- `Type` — one of `DES2EDE`, `DES3EDE`, `AES128`, `AES192`, `AES256`.
- `KeyValue` — the key in uppercase hex.
- `KCV` — the key's KCV (see [KCV](#key-check-value-kcv)).

**Restore is replace-all**: the current keypair, ZMKs and keys are cleared first.
Each row's KCV is recomputed from its key value. Rows that are structurally invalid
(unknown type or non-hex key value) are skipped. Rows whose KCV does **not** match
their key value are held back, and the app prompts you to **Accept** (import them
anyway, storing a freshly recomputed correct KCV) or **Skip** all of them. This is
the expected case when restoring an older backup whose AES KCVs were computed before
the switch to AES-CMAC.

### MZMKdata CSV (Derive ZMK page)

Header:

```
VERSION,YEAR,MONTH,DAY,HOUR,MINUTE,SHARED INFORMATION,MZMK CHECK VALUE,MZMK KEY SCHEME,HSM PUBLIC KEY
```

One data row per file:

- `VERSION` — `1`.
- `YEAR,MONTH,DAY,HOUR,MINUTE` — local generation time.
- `SHARED INFORMATION` — the X9.63 KDF SharedInfo, lowercase hex.
- `MZMK CHECK VALUE` — the derived ZMK's KCV, lowercase hex.
- `MZMK KEY SCHEME` — `Double Length 3DES`, `Triple Length 3DES`, `128-bit AES`, `192-bit AES`, or `256-bit AES`.
- `HSM PUBLIC KEY` — the sender's EC public key (SPKI DER), lowercase hex.

### Import / Export key CSV (Key Management → Import / Export, TMD)

The Thales payShield TMD key-exchange CSV wraps a single working key as a TR-31 key
block protected by a ZMK. Header:

```
YEAR,MONTH,DAY,HOUR,MINUTE,KEY NAME,CHECK VALUE,COMPONENTS,ALGORITHM,MZMK ID,MZMK CHECK VALUE,TR31 KEY BLOCK
```

One data row per file:

- `YEAR,MONTH,DAY,HOUR,MINUTE` — UTC generation time.
- `KEY NAME` — free-text key name.
- `CHECK VALUE` — the wrapped key's KCV (see [KCV](#key-check-value-kcv)).
- `COMPONENTS` — `2`.
- `ALGORITHM` — `Double Length 3DES`, `Triple Length 3DES`, `AES-128 bit`, `AES-192 bit`, or `AES-256 bit`.
- `MZMK ID` — the protecting ZMK's ID.
- `MZMK CHECK VALUE` — the protecting ZMK's KCV.
- `TR31 KEY BLOCK` — the TR-31 key block (versions B and D).

> Note: the `ALGORITHM` AES labels here (`AES-NNN bit`) differ from the MZMKdata CSV's
> `MZMK KEY SCHEME` AES labels (`NNN-bit AES`); the 3DES labels are the same in both.
