#!/bin/bash

# Claude CLAUDE.md 同期・更新システム
# 各ユーザーのCLAUDE.mdを管理し、ベースの更新と個人カスタマイズを両立

set -e

# カラーコード
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# 設定
MASTER_CLAUDE_MD="/opt/claude-templates/CLAUDE_BASE.md"
USER_CLAUDE_DIR="$HOME/.claude"
USER_CLAUDE_MD="$USER_CLAUDE_DIR/CLAUDE.md"
BACKUP_DIR="$USER_CLAUDE_DIR/backups"
CUSTOM_MARKER="## 📝 .* 専用カスタマイズエリア"

# ログ関数
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# 使用法
show_usage() {
    echo "Claude CLAUDE.md 同期・更新システム"
    echo ""
    echo "使用法:"
    echo "  $0 [COMMAND] [OPTIONS]"
    echo ""
    echo "コマンド:"
    echo "  sync       マスターベースで更新（カスタマイズ部分は保持）"
    echo "  backup     現在のCLAUDE.mdをバックアップ"
    echo "  restore    バックアップから復元"
    echo "  status     現在の状態を確認"
    echo "  custom     カスタマイズエリアのみ表示/編集"
    echo "  reset      完全リセット（カスタマイズも削除）"
    echo ""
    echo "オプション:"
    echo "  --force    確認なしで実行"
    echo "  --dry-run  実際の変更をせず、プレビューのみ"
    echo ""
    echo "例:"
    echo "  $0 sync              # 安全な同期（カスタマイズ保持）"
    echo "  $0 backup            # 現在の状態をバックアップ"
    echo "  $0 custom --edit     # カスタマイズエリアを編集"
}

# バックアップ作成
create_backup() {
    local backup_name="claude_md_$(date +%Y%m%d_%H%M%S).md"
    local backup_file="$BACKUP_DIR/$backup_name"
    
    mkdir -p "$BACKUP_DIR"
    
    if [ -f "$USER_CLAUDE_MD" ]; then
        cp "$USER_CLAUDE_MD" "$backup_file"
        log_success "バックアップ作成: $backup_file"
        return 0
    else
        log_warning "バックアップ対象ファイルが存在しません: $USER_CLAUDE_MD"
        return 1
    fi
}

# カスタマイズエリア抽出
extract_custom_area() {
    local input_file="$1"
    local output_file="$2"
    
    if [ ! -f "$input_file" ]; then
        log_warning "ファイルが存在しません: $input_file"
        return 1
    fi
    
    # カスタマイズエリア以降を抽出
    awk "/$CUSTOM_MARKER/,EOF { print }" "$input_file" > "$output_file" 2>/dev/null || {
        log_warning "カスタマイズエリアが見つかりませんでした"
        echo "" > "$output_file"
        return 1
    }
    
    return 0
}

# マスターベース取得（ユーザー情報で置換）
get_master_base() {
    local output_file="$1"
    local user_name="${USER:-$(whoami)}"
    local full_name="$user_name"  # 実際の運用では適切な名前取得ロジックを追加
    
    if [ ! -f "$MASTER_CLAUDE_MD" ]; then
        log_error "マスターファイルが存在しません: $MASTER_CLAUDE_MD"
        return 1
    fi
    
    # テンプレート変数を実際の値に置換
    sed -e "s/{{ item.name }}/$user_name/g" \
        -e "s/{{ item.full_name }}/$full_name/g" \
        -e "s/{{ llm_orchestrator_url }}/http:\/\/localhost:4000/g" \
        -e "s/{{ ansible_date_time.iso8601 }}/$(date -u +%Y-%m-%dT%H:%M:%SZ)/g" \
        "$MASTER_CLAUDE_MD" > "$output_file"
    
    return 0
}

# CLAUDE.md 同期（カスタマイズエリア保持）
sync_claude_md() {
    local dry_run="$1"
    local temp_dir=$(mktemp -d)
    local new_base="$temp_dir/new_base.md"
    local custom_area="$temp_dir/custom_area.md"
    local merged_file="$temp_dir/merged.md"
    
    log_info "CLAUDE.md 同期開始..."
    
    # 1. 現在のカスタマイズエリアをバックアップ
    if [ -f "$USER_CLAUDE_MD" ]; then
        extract_custom_area "$USER_CLAUDE_MD" "$custom_area"
    else
        touch "$custom_area"
    fi
    
    # 2. 新しいベースを取得
    if ! get_master_base "$new_base"; then
        log_error "マスターベース取得に失敗しました"
        rm -rf "$temp_dir"
        return 1
    fi
    
    # 3. ベース部分（カスタマイズエリア前まで）を抽出
    awk "1; /$CUSTOM_MARKER/ { exit }" "$new_base" > "$merged_file"
    
    # 4. カスタマイズエリアが存在する場合は追加
    if [ -s "$custom_area" ]; then
        cat "$custom_area" >> "$merged_file"
        log_info "既存のカスタマイズエリアを保持しました"
    else
        # カスタマイズエリアが空の場合、デフォルトのカスタマイズエリアを追加
        awk "/$CUSTOM_MARKER/,EOF { print }" "$new_base" >> "$merged_file"
        log_info "新しいカスタマイズエリアテンプレートを追加しました"
    fi
    
    # 5. dry-runモードの場合はプレビュー表示
    if [ "$dry_run" = "true" ]; then
        log_info "=== DRY-RUN モード: 変更プレビュー ==="
        echo ""
        echo "新しいCLAUDE.mdの内容："
        echo "----------------------------------------"
        cat "$merged_file"
        echo "----------------------------------------"
        echo ""
        log_info "実際の変更は行われませんでした"
    else
        # 6. 実際のファイル更新
        create_backup  # 安全のためバックアップ
        
        mkdir -p "$USER_CLAUDE_DIR"
        cp "$merged_file" "$USER_CLAUDE_MD"
        chmod 600 "$USER_CLAUDE_MD"
        
        log_success "CLAUDE.md を更新しました"
        log_info "カスタマイズエリアは保持されています"
    fi
    
    # 7. 一時ディレクトリクリーンアップ
    rm -rf "$temp_dir"
    return 0
}

# ステータス確認
show_status() {
    echo ""
    echo -e "${BLUE}=== Claude CLAUDE.md ステータス ===${NC}"
    echo ""
    
    # ファイル存在確認
    if [ -f "$USER_CLAUDE_MD" ]; then
        log_success "CLAUDE.md: 存在 ($USER_CLAUDE_MD)"
        
        # ファイルサイズ
        local file_size=$(wc -c < "$USER_CLAUDE_MD")
        echo "  ファイルサイズ: ${file_size} bytes"
        
        # 最終更新日時
        local last_modified=$(stat -c %y "$USER_CLAUDE_MD" 2>/dev/null || stat -f %m "$USER_CLAUDE_MD" 2>/dev/null)
        echo "  最終更新: $last_modified"
        
        # カスタマイズエリアの確認
        if grep -q "$CUSTOM_MARKER" "$USER_CLAUDE_MD"; then
            log_success "カスタマイズエリア: 存在"
            local custom_lines=$(awk "/$CUSTOM_MARKER/,EOF { count++ } END { print count+0 }" "$USER_CLAUDE_MD")
            echo "  カスタマイズ行数: $custom_lines 行"
        else
            log_warning "カスタマイズエリア: 未検出"
        fi
    else
        log_warning "CLAUDE.md: 存在しません ($USER_CLAUDE_MD)"
    fi
    
    # マスターファイル確認
    if [ -f "$MASTER_CLAUDE_MD" ]; then
        log_success "マスターベース: 利用可能 ($MASTER_CLAUDE_MD)"
    else
        log_error "マスターベース: 利用不可 ($MASTER_CLAUDE_MD)"
    fi
    
    # バックアップ確認
    if [ -d "$BACKUP_DIR" ]; then
        local backup_count=$(ls -1 "$BACKUP_DIR"/*.md 2>/dev/null | wc -l)
        if [ "$backup_count" -gt 0 ]; then
            log_info "バックアップ: $backup_count 個存在"
            echo "  最新バックアップ: $(ls -t "$BACKUP_DIR"/*.md 2>/dev/null | head -1)"
        else
            log_info "バックアップ: なし"
        fi
    else
        log_info "バックアップ: ディレクトリなし"
    fi
    
    echo ""
}

# カスタマイズエリア編集
edit_custom_area() {
    local editor="${EDITOR:-nano}"
    local temp_custom=$(mktemp)
    
    # 現在のカスタマイズエリアを抽出
    if [ -f "$USER_CLAUDE_MD" ]; then
        extract_custom_area "$USER_CLAUDE_MD" "$temp_custom"
    else
        log_warning "CLAUDE.md が存在しません。まず sync を実行してください。"
        return 1
    fi
    
    # エディタで編集
    log_info "カスタマイズエリアを編集中... (エディタ: $editor)"
    "$editor" "$temp_custom"
    
    # 変更を反映
    if [ -s "$temp_custom" ]; then
        local temp_dir=$(mktemp -d)
        local new_base="$temp_dir/new_base.md"
        local merged_file="$temp_dir/merged.md"
        
        # ベース部分を取得
        get_master_base "$new_base"
        awk "1; /$CUSTOM_MARKER/ { exit }" "$new_base" > "$merged_file"
        
        # 編集されたカスタマイズエリアを追加
        cat "$temp_custom" >> "$merged_file"
        
        # バックアップして更新
        create_backup
        cp "$merged_file" "$USER_CLAUDE_MD"
        
        rm -rf "$temp_dir"
        log_success "カスタマイズエリアを更新しました"
    else
        log_warning "カスタマイズエリアが空のため、更新されませんでした"
    fi
    
    rm -f "$temp_custom"
}

# バックアップから復元
restore_from_backup() {
    if [ ! -d "$BACKUP_DIR" ]; then
        log_error "バックアップディレクトリが存在しません"
        return 1
    fi
    
    local backups=($(ls -t "$BACKUP_DIR"/*.md 2>/dev/null))
    if [ ${#backups[@]} -eq 0 ]; then
        log_error "利用可能なバックアップがありません"
        return 1
    fi
    
    echo "利用可能なバックアップ:"
    for i in "${!backups[@]}"; do
        echo "  $((i+1)). $(basename "${backups[i]}")"
    done
    
    echo -n "復元するバックアップ番号を入力 (1-${#backups[@]}): "
    read -r selection
    
    if [[ "$selection" =~ ^[0-9]+$ ]] && [ "$selection" -ge 1 ] && [ "$selection" -le "${#backups[@]}" ]; then
        local selected_backup="${backups[$((selection-1))]}"
        create_backup  # 現在の状態もバックアップ
        cp "$selected_backup" "$USER_CLAUDE_MD"
        log_success "バックアップから復元しました: $(basename "$selected_backup")"
    else
        log_error "無効な選択です"
        return 1
    fi
}

# 完全リセット
reset_claude_md() {
    local force="$1"
    
    if [ "$force" != "true" ]; then
        echo -n "⚠️  完全リセットします。カスタマイズも削除されます。続行しますか? (y/N): "
        read -r confirm
        if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
            log_info "リセットを中止しました"
            return 0
        fi
    fi
    
    # バックアップ作成
    if [ -f "$USER_CLAUDE_MD" ]; then
        create_backup
    fi
    
    # 新しいベースで完全置換
    local temp_file=$(mktemp)
    if get_master_base "$temp_file"; then
        cp "$temp_file" "$USER_CLAUDE_MD"
        chmod 600 "$USER_CLAUDE_MD"
        rm -f "$temp_file"
        log_success "CLAUDE.md を完全リセットしました"
    else
        log_error "リセットに失敗しました"
        return 1
    fi
}

# メイン処理
main() {
    local command="$1"
    shift
    
    local dry_run=false
    local force=false
    local edit_mode=false
    
    # オプション解析
    while [[ $# -gt 0 ]]; do
        case $1 in
            --dry-run)
                dry_run=true
                shift
                ;;
            --force)
                force=true
                shift
                ;;
            --edit)
                edit_mode=true
                shift
                ;;
            --help)
                show_usage
                exit 0
                ;;
            *)
                log_error "不明なオプション: $1"
                show_usage
                exit 1
                ;;
        esac
    done
    
    case "$command" in
        sync)
            sync_claude_md "$dry_run"
            ;;
        backup)
            create_backup
            ;;
        restore)
            restore_from_backup
            ;;
        status)
            show_status
            ;;
        custom)
            if [ "$edit_mode" = "true" ]; then
                edit_custom_area
            else
                if [ -f "$USER_CLAUDE_MD" ]; then
                    extract_custom_area "$USER_CLAUDE_MD" /tmp/custom_preview
                    echo -e "${BLUE}=== カスタマイズエリア ===${NC}"
                    cat /tmp/custom_preview
                    rm -f /tmp/custom_preview
                else
                    log_warning "CLAUDE.md が存在しません"
                fi
            fi
            ;;
        reset)
            reset_claude_md "$force"
            ;;
        *)
            if [ -z "$command" ]; then
                show_usage
            else
                log_error "不明なコマンド: $command"
                show_usage
                exit 1
            fi
            ;;
    esac
}

# スクリプト実行
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi