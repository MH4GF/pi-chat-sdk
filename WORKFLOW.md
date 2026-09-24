---
tracker:
  kind: github
  provider:
    repo: MH4GF/pi-chat-sdk
  active_states: ["Todo", "In Progress", "Merging", "Rework"]
  terminal_states: ["Done", "Canceled"]

review_watch:
  enabled: true
  states: ["Human Review"]
  on_conflict_state: "In Progress"

workspace:
  root: /Users/hermes/.symphony/workspaces/pi-chat-sdk

hooks:
  after_create: |
    set -eu
    git clone --depth 1 https://github.com/MH4GF/pi-chat-sdk.git .

agent:
  max_concurrent_agents: 1
  max_turns: 20

codex:
  command: /Users/hermes/.local/bin/safe-claude
  claude_args: ["--permission-mode", "bypassPermissions"]
  stall_timeout_ms: 600000
  turn_timeout_ms: 1800000
---

MH4GF/pi-chat-sdk (public な npm ライブラリ。pi の session と Chat SDK の thread を対応させる glue) の clone で作業する。repo 構造・検証コマンド・依存更新のポリシーは root の `CLAUDE.md` を起点に把握する。

## Issue

{{ issue.identifier }} - {{ issue.title }}

## Body

{{ issue.description }}

{% if attempt %}
## Continuation context

- これはリトライ attempt #{{ attempt }}。チケットが active state のため再ディスパッチされた。
- 最初からやり直さず、現在の workspace 状態から resume する。
- 完了済みの調査や validation を繰り返さない。新規コード変更で必要な場合は除く。
- issue が active state の間は turn を終わらせない。required permissions/secrets が missing で blocked の場合は除く。
{% endif %}

## ワークフロー手順

- セッション起動直後に `symphony-workflow` スキルを呼ぶ。ステータスの振り分け / workpad 運用 / 実装 / レビュースイープ / `Human Review` 遷移 / マージまで、進行は全て同スキルの手順に従う
- `symphony-workflow` スキルが利用できない環境では実装に入らない。issue にブロッカーコメント (何が不足しているか / 解除に必要な人間の対応) を 1 件書き、issue を `Human Review` へ動かして終了する
- 下の「本リポジトリ固有ルール」はスキルの共通手順を上書きする

## 本リポジトリ固有ルール

- 依存更新の issue では、成果物は `origin/main` から切った PR 1 本。Dependabot の PR を直接 merge しない。main に新しい版が載れば Dependabot が自分の PR を閉じる。受け入れない bump は `.github/dependabot.yml` の `ignore` に書いて理由をコメントする (`@dependabot` コメントは使わない)
- `package.json` の `version` を上げる条件と、上げない条件は `CLAUDE.md` の Maintenance policy に従う
- tag と npm publish は人間が行う。bg session は tag を打たない
- README と `examples/*/package.json` に書かれた版は公開 API の一部として扱う。依存の版を動かしたら同時に直す

## スコープ外

issue が次のいずれかを含むなら、止まってユーザーに label 修正を依頼する。

- vault 内容の編集 (`MH4GF/works`)
- `MH4GF/claude-code` の編集 (claude-code workflow の管轄)
- Symphony orchestrator のコード (`MH4GF/symphony`)
- npm への publish、tag の作成
- secrets のコミット
