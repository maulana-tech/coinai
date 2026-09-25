# Plan: coinAI di BNB Chain + AI Agent

Target: Indonesia Web3 Hackathon 2026, **track AI Agents** (cadangan: Finance & Commerce).
Deadline submit: **30 Sep 2026**. Waktu tersisa ±5 hari.

## Pitch dalam 1 kalimat

> coinAI = agent AI yang menabung dan mengelola yield untukmu di BNB Chain. Setiap pembayaran masuk otomatis dipisah ke tabungan, lalu agent memilih vault terbaik. Semuanya dibatasi aturan di smart contract, jadi AI tidak pernah bisa memindahkan dana ke luar akunmu.

Kunci cerita untuk juri: **AI yang mengambil keputusan, smart contract yang menjaga batasnya.** Setiap aksi agent tercatat di chain beserta alasannya.

---

## Keputusan arsitektur

| Hal | Sekarang (Flare) | Jadi (BNB) | Alasan |
|---|---|---|---|
| Network | Flare Coston2 (114) | **BSC Testnet (97)** | Didukung penuh oleh BscScan dan faucet resmi, dan `viem/chains` sudah punya `bscTestnet` |
| Token | FXRP (6 desimal) | **MockUSDT `tUSDT` (6 desimal)** dengan `faucet()` publik | Tetap 6 desimal, jadi `FXRP_DECIMALS` dan semua lapisan lib tidak perlu diubah |
| Yield | SparkDEX / Firelight / Upshift | **3 vault ERC-4626 milik sendiri** (Conservative / Balanced / Growth) dengan APY simulasi | Testnet tidak punya yield sungguhan. Di pitch, jelaskan bahwa di mainnet vault ini diganti Venus / Lista / PancakeSwap |
| Enum `YieldTarget` | SparkDEX=0, Firelight=1, Upshift=2 | Conservative=0, Balanced=1, Growth=2 | Urutannya tetap 3 slot, jadi mapping di frontend tinggal ganti label |
| Adapter | SparkDexAdapter + VaultAdapter | **VaultAdapter saja** | SparkDEX hanya ada di Flare, jadi dihapus |
| Backend agent | tidak ada | **Vercel Functions `web/api/`** | Deploy-nya sama dengan web, tidak perlu server atau infra baru |
| LLM | tidak ada | **Claude API dengan tool use** | Agent memanggil tool yang terbatas, bukan menulis transaksi bebas |
| Database | tidak ada | **tidak ada**, log keputusan dibaca dari event on-chain | Lebih sedikit infra, dan hasilnya lebih transparan |

---

## Fase 1: Smart contract (CoinAI v2)

Perubahan di `evm/src/Save.sol`:

1. **Delegasi agent.** Dibuat aman dengan menyimpan batas aturan (policy) di contract:
   ```solidity
   struct AgentPolicy { address agent; uint16 minSplitBps; uint16 maxSplitBps; uint64 expiry; }
   function setAgent(address agent, uint16 minBps, uint16 maxBps, uint64 expiry) external; // msg.sender = user
   function revokeAgent() external;
   ```
2. **Fungsi yang boleh dipanggil agent** (semuanya dicek `msg.sender == policy.agent && block.timestamp < expiry`):
   - `agentSetSplit(user, bps, string reason)`: nilai `bps` wajib berada di antara `[minBps, maxBps]`.
   - `agentRebalance(user, YieldTarget target, string reason)`: memindahkan tabungan ke vault yang sudah di-whitelist. **Share selalu di-mint ke `user`.**
   - Agent **tidak punya jalur transfer ke alamat selain user**. Ini jaminan keamanan utamanya.
3. **Event transparansi:** `AgentAction(user, agent, action, reason)`. Alasan disimpan sebagai string di event supaya langsung terbaca di BscScan.
4. **Perbaikan keamanan:** saat ini `withdrawSavingsToAdapter` menerima `adapter` apa saja. Ubah jadi whitelist adapter dan vault (owner menjalankan `setVault(target, vault)`).
5. **Rename `fxrp` → `token`** di contract (constructor dan immutable).
6. **Test Foundry:** agent tidak bisa set split di luar batas, agent tidak bisa beraksi setelah expiry atau revoke, agent tidak bisa mengirim dana ke dirinya sendiri, dan non-agent ditolak.

Contract baru:
- `MockUSDT.sol`: ERC20 6 desimal dengan `faucet()` yang mint 1.000 tUSDT per panggilan (ada cooldown).
- `SimpleVault.sol`: turunan dari `FxrpVault.sol` yang dibuat generik (asset bebas) dan diberi `apyBps` sebagai metadata untuk dibaca agent. Di-deploy 3 kali.

Deploy script: satu `DeployAll.s.sol` yang men-deploy token, 3 vault, VaultAdapter, dan CoinAI, lalu mencetak semua alamat. Tambahkan `bsc_testnet` ke `[rpc_endpoints]` di `foundry.toml`. Tambahkan juga `TOKEN_ADDRESS` dan `AGENT_ADDRESS` ke `.env.example`.

## Fase 2: Migrasi frontend ke BNB

- `web/src/lib/wagmi.ts`: ganti chain Flare dengan `bscTestnet` dari `viem/chains`.
- `web/src/lib/config.ts`: `FLARE_*` → `CHAIN_*` (chain id 97, RPC, explorer `testnet.bscscan.com`), lalu semua alamat baru. Hapus `SPARKDEX_*`, `FIRELIGHT_*`, `UPSHIFT_*`, dan `YIELD_TOKEN_OUT`.
- `coinai.evm.ts`: perbarui ABI (fungsi agent, event `AgentAction`), hapus jalur SparkDEX di `depositYieldDirect`, dan tambahkan kode error baru ke `ERROR_CODES`, `errors.ts`, dan `i18n.tsx`.
- Halaman faucet: tBNB → link ke faucet resmi BNB. Tombol "Mint tUSDT" memanggil `MockUSDT.faucet()`.
- Label: FXRP → tUSDT, C2FLR → tBNB, dan Flare → BNB Chain di ketiga locale (en/id/zh).
- Landing: ganti logo protokol (SparkDEX/Firelight) dan copy "Flare" dengan BNB Chain dan cerita AI agent.
- `deployments.json`, README, docs, dan `AGENTS.md`: perbarui alamat dan chain.

## Fase 3: AI Agent (backend)

Lokasinya di `web/api/` (Vercel Functions), memakai `@anthropic-ai/sdk` dan ethers (sudah terpasang).

**Tool untuk LLM:**

| Tool | Jenis | Isi |
|---|---|---|
| `get_account(user)` | baca | split, spend, shares, lock, target |
| `get_payment_history(user)` | baca | event `PaymentRouted` 30 hari terakhir: frekuensi dan rata-rata nominal |
| `get_vaults()` | baca | APY, TVL, dan profil risiko ketiga vault |
| `set_split(user, bps, reason)` | tulis | memanggil `agentSetSplit`, dibatasi oleh contract |
| `rebalance(user, target, reason)` | tulis | memanggil `agentRebalance` |

**Endpoint:**
- `POST /api/agent/run {user}`: satu siklus agent. Agent membaca data, memutuskan, mengeksekusi, lalu mengembalikan ringkasan. Endpoint ini dipakai tombol "Run agent now" di demo.
- `POST /api/agent/chat {user, messages}`: user bertanya ("kenapa split-ku dinaikkan?", "aku mau lebih agresif"). Agent menjelaskan dan boleh mengeksekusi tool.
- Cron: `vercel.json` memanggil `/api/agent/run-all`, yang mengambil user dari event `AgentSet`. **Catatan:** di Vercel Hobby, cron cuma bisa 1x/hari. Itu cukup, karena saat demo kita pakai tombol "Run now".

**Keamanan:**
- `AGENT_PRIVATE_KEY` dan `ANTHROPIC_API_KEY` hanya disimpan di env Vercel, tidak pernah dikirim ke client.
- Wallet agent adalah wallet terpisah yang hanya berisi tBNB untuk gas.
- Pengaman sebenarnya ada di contract. Walaupun LLM kena prompt injection, AI tetap hanya bisa bergerak di dalam batas policy.
- Input chat dibatasi panjangnya, dan endpoint memverifikasi alamat user lewat tanda tangan (`personal_sign`) supaya orang lain tidak bisa men-trigger agent untuk akunmu.

## Fase 4: Halaman agent di frontend

Route baru `/app/agent`:
1. **Aktifkan agent:** slider split minimum dan maksimum serta pilihan durasi, lalu satu transaksi `setAgent`. Ada juga tombol Revoke.
2. **Log keputusan:** daftar event `AgentAction` (aksi, alasan, waktu, dan link ke BscScan).
3. **Chat dengan coinAI** dan tombol **Run agent now**.

Tambahkan juga menu di `app-shell` dan string i18n untuk ketiga locale.

## Fase 5: Submission

- Pitch deck. **Submit versi awal hari pertama**, karena bisa diperbarui sampai 30 Sep.
- Video demo ±2 menit: mint tUSDT → bayar lewat payment link → aktifkan agent → Run now → agent menaikkan split dan memindahkan ke vault Growth dengan alasan → cek di BscScan.
- Perbarui README untuk juri: arsitektur, alamat contract, cara menjalankan, dan model keamanannya.

---

## Jadwal (25–30 Sep)

| Hari | Fokus | Hasil |
|---|---|---|
| **Kam 25** | Pitch deck v1 → **submit**. Fase 1: contract + test | Submission masuk, `forge test` hijau |
| **Jum 26** | Deploy ke BSC Testnet. Fase 2: migrasi frontend | App jalan di BNB tanpa AI |
| **Sab 27** | Fase 3: endpoint `run` + tool, lalu `chat` | Agent bisa beraksi dan terlihat di BscScan |
| **Min 28** | Fase 4: halaman agent | Alur end-to-end dari UI |
| **Sen 29** | Polish, i18n, README, video demo | Siap demo |
| **Sel 30** | Buffer dan perbarui submission final | ✅ |

**Kalau waktu mepet, bagian ini yang dipotong duluan (urut dari yang pertama dikorbankan):** cron → verifikasi `personal_sign` di chat (diganti rate limit per alamat) → fitur chat (sisakan "Run now" dan log keputusan). Yang **tidak boleh dipotong:** guardrail di contract dan log `AgentAction`, karena itu inti ceritanya.

## Pertanyaan yang perlu dijawab sebelum mulai

1. **Provider LLM:** sudah punya Anthropic API key? (Default di plan: Claude. Bisa diganti provider lain tanpa mengubah desain.)
2. **Deploy Flare lama:** dibuang total, atau dipertahankan sebagai chain kedua? (Saran: buang, supaya fokus.)
3. **Wallet deployer + agent:** sudah punya tBNB di BSC Testnet?
