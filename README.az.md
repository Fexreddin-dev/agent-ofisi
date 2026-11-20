# Agent Ofisi

**Claude Code agentləri üçün canlı 3D ofis.** 11 işçi, bir müdir, ortaq tapşırıq lövhəsi və kimin nə etdiyini gördüyün otaq.

![Agent Ofisi](docs/office.png)

[English](README.md)

## Nə edir

- **Agent komandası.** Mətn, dizayn, video, araşdırma, sayt kodu, yoxlama və lisenziya. Hər işçi nəticəsini özü növbəti işçiyə ötürür.
- **Canlı 3D ofis.** Kimin işlədiyini, gözlədiyini, boş olduğunu, işlərin masadan masaya keçməsini görürsən.
- **Tapşırıq lövhəsi.** İşçiyə bas və tapşırıq yaz, ya da çatda: `Reel, 15 saniyəlik Reels düzəlt`.
- **Səhər və gecə növbəsi.** `səhər növbəsini başla` de. Müdir hər 15 dəqiqədə işləri paylayır, sonda hesabat yazır.
- **Təhlükəsiz.** Sənin "bəli"n olmadan pullu addım, endirmə, paylaşma, deploy yoxdur.

## Quraşdırma

**Əvvəlcə:** [Node.js](https://nodejs.org) (LTS düyməsi) və [Claude Code](https://claude.com/claude-code) qur. Başqa heç nə lazım deyil: `npm install` yox, API açarı yox.

1. **Endir.** Bu səhifədə yaşıl **Code** düyməsinə bas → **Download ZIP**.
2. **Arxivi aç** və qalacağı bir qovluğa qoy, məsələn `Documents\agent-ofisi`. Sonra qovluğu yerindən tərpətmə, çünki Claude Code bu ünvanı yadda saxlayır.
3. **Quraşdır.** Qovluğu aç və **`Install.bat`** faylına iki dəfə bas (Windows). macOS/Linux-da qovluqda terminal aç və `./install.sh` yaz. Ekranda ✓ işarəli sətirlər görünəcək.
4. **Ofisi aç.** **`Ofis.bat`** faylına iki dəfə bas (macOS/Linux: `./ofis.sh`). Brauzerdə http://127.0.0.1:8770 açılır.
5. **İşə başla.** Claude Code-u həmin qovluqda aç (proqramda bu qovluğu seç; terminalda qovluğa keç və `claude` yaz). Bu çat **Atlas**-dır, müdir. Tapşırıq yaz, məsələn `Keeper, Kokoro TTS-in lisenziyasını yoxla`, və ofisdə izlə.

ZIP əvəzinə git: `git clone https://github.com/Fexreddin-dev/agent-ofisi`, sonra 3-cü addım.

## Komanda

| | | | |
|---|---|---|---|
| **Atlas**, müdir | **Quill**, mətn | **Hue**, dizayn | **Reel**, video |
| **Pulse**, SMM planı | **Scout**, araşdırma | **Keeper**, lisenziya, büdcə | **Iris**, keyfiyyət |
| **Mason**, sayt kodu | **Verdi**, sayt qiyməti | **Nova**, ML modellər | **Lumen**, model Lab-ı |

## Bilməli olduqların

- Mason və Verdi `~/.claude/skills/`-də sayt qurma və sayt qiymətləndirmə skill-i olanda daha yaxşı işləyir (repoya daxil deyil, öz skill-ini qur).
- Hər şey sənin kompüterində qalır: ofis yalnız 127.0.0.1-də açılır, `data/` və `out/` heç yerə getmir.
- Silmək: `node install.js --uninstall` (faylların qalır).

MIT lisenziyası
