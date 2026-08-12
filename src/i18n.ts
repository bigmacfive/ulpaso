import { createSignal } from "solid-js";

type Locale = "en" | "ko" | "ja";
type MessageParams = Record<string, string | number>;

const LOCALE_STORAGE_KEY = "ulpaso-locale";
const localeLabels: Record<Locale, string> = { en: "English", ko: "한국어", ja: "日本語" };

const en = {
  "command.new": "New document",
  "command.open": "Open document",
  "command.save": "Save document",
  "command.saveAs": "Save as",
  "command.focus": "Toggle focus mode",
  "command.theme": "Switch theme",
  "document.untitled": "Untitled",
  "document.untitledSection": "Untitled section",
  "document.new": "New document",
  "document.opened": "Document opened",
  "document.saved": "Saved",
  "document.saving": "Saving",
  "document.savingEllipsis": "Saving…",
  "document.unsaved": "Unsaved",
  "document.unsavedChanges": "Unsaved changes",
  "document.openDesktopOnly": "Opening files is available in the desktop app",
  "document.saveDesktopOnly": "Saving files is available in the desktop app",
  "document.openFailed": "Could not open the document",
  "document.saveFailed": "Could not save the document",
  "document.restored": "Your previous draft was safely restored",
  "settings.title": "Settings",
  "settings.close": "Close settings",
  "settings.appearance": "Appearance",
  "settings.appearanceDescription": "Editor brightness",
  "settings.colorTheme": "Color theme",
  "settings.light": "Light",
  "settings.dark": "Dark",
  "settings.language": "Language",
  "settings.languageDescription": "Interface language",
  "settings.meeting": "Meeting notes",
  "settings.meetingDescription": "On-device transcription",
  "settings.meetingReady": "Local models ready",
  "settings.meetingDownload": "Downloads about {size} of AI models on first use",
  "settings.audioPermissions": "Audio permissions",
  "settings.meetingDetection": "Meeting detection prompts",
  "settings.meetingDetectionDescription": "Asks before recording when a meeting is detected",
  "settings.on": "On",
  "settings.off": "Off",
  "settings.shortcuts": "Keyboard shortcuts",
  "settings.shortcutsHint": "Show keyboard shortcuts",
  "settings.shortcutsDescription": "Hover over ? to view",
  "shortcuts.title": "Keyboard shortcuts",
  "shortcuts.description": "Fast paths for writing and navigation",
  "shortcuts.group.document": "Document",
  "shortcuts.group.editing": "Editing",
  "shortcuts.group.view": "View & navigation",
  "shortcuts.group.meeting": "Meeting notes",
  "shortcut.undo": "Undo",
  "shortcut.redo": "Redo",
  "shortcut.bold": "Bold",
  "shortcut.italic": "Italic",
  "shortcut.inlineCode": "Inline code",
  "shortcut.strike": "Strikethrough",
  "shortcut.heading1": "Heading 1",
  "shortcut.heading2": "Heading 2",
  "shortcut.heading3": "Heading 3",
  "shortcut.blockMenu": "Open block menu",
  "shortcut.palette": "Command palette",
  "shortcut.settings": "Open settings",
  "shortcut.sidebar": "Toggle sidebar",
  "shortcut.dismiss": "Close overlays",
  "shortcut.meeting": "Start or stop meeting notes",
  "sidebar.windowTools": "Window tools",
  "sidebar.open": "Open sidebar",
  "sidebar.close": "Close sidebar",
  "sidebar.files": "Files",
  "sidebar.outline": "Outline",
  "sidebar.recent": "Recent documents",
  "sidebar.emptyRecent": "Documents you open will appear here.",
  "sidebar.emptyOutlineLine1": "Add headings to build",
  "sidebar.emptyOutlineLine2": "your outline here.",
  "palette.title": "Command palette",
  "palette.search": "Search commands",
  "palette.available": "Available commands",
  "palette.commands": "Commands",
  "palette.empty": "No matching commands.",
  "palette.select": "Select",
  "palette.close": "Close",
  "confirm.title": "Save your changes?",
  "confirm.body.new": "You can save your work before creating a new document. Continuing without saving will discard your latest changes.",
  "confirm.body.open": "You can save your work before opening another document. Continuing without saving will discard your latest changes.",
  "confirm.cancel": "Cancel",
  "confirm.dontSave": "Don't save",
  "confirm.saveContinue": "Save and continue",
  "meeting.title": "Meeting notes · {date}",
  "meeting.desktopOnly": "Meeting transcription is available in the desktop app",
  "meeting.finalized": "Meeting notes were organized by speaker",
  "meeting.speakerWarning": "Organized up to 4 speakers · Some voices may be merged when there are 5 or more",
  "meeting.finishing": "Finishing the current meeting transcript",
  "meeting.startFailed": "Could not start meeting notes",
  "meeting.detectedApp": "Meeting app",
  "meeting.detectionPromptTitle": "Record this {app} meeting?",
  "meeting.detectionPromptBody": "A meeting app is using the microphone. Recording starts only after you confirm.",
  "meeting.detectionPromptDismiss": "Not now",
  "meeting.detectionPromptStart": "Start recording",
  "meeting.detectionPromptFailed": "Could not show the meeting prompt",
  "meeting.settingsFailed": "Could not open audio settings",
  "meeting.transcribing": "Transcribing {time}",
  "meeting.preparingModel": "Preparing model",
  "meeting.modelProgress": "Model {progress}%",
  "meeting.permissions": "Checking permissions",
  "meeting.organizing": "Organizing speakers",
  "meeting.organizingProgress": "Organizing speakers {progress}%",
  "meeting.attention": "Transcription needs attention",
  "meeting.preparingEngine": "Preparing engine",
  "meeting.stop": "Stop meeting notes",
  "meeting.cancel": "Cancel meeting setup",
  "meeting.organizingNotes": "Organizing meeting notes",
  "meeting.start": "Start meeting notes",
  "meeting.stopOrCancel": "Stop or cancel meeting transcription",
  "meeting.finishBeforeOpen": "Finish the meeting transcript before opening another document",
  "meeting.finishBeforeNew": "Finish the meeting transcript before creating a new document",
  "meeting.errorLabel": "Meeting notes error",
  "meeting.errorTitle": "Transcription could not start",
  "meeting.errorBody": "Check microphone and system audio permissions.",
  "meeting.error.microphonePermission": "Microphone access is off. Allow it in System Settings, then try again.",
  "meeting.error.microphoneUnavailable": "No microphone was found. Connect one or use system audio only.",
  "meeting.error.audioCapture": "Audio access was denied or recording could not start. Check System Settings and try again.",
  "meeting.error.engine": "The local transcription service could not start. Try again in a moment.",
  "meeting.error.recovery": "Transcription stopped unexpectedly. Your recorded audio was kept safely for recovery.",
  "meeting.error.localFile": "A local recording file could not be prepared. Check available storage and try again.",
  "meeting.openSettings": "Open settings",
  "meeting.tryAgain": "Try again",
  "meeting.systemOnly": "Use system audio only",
  "meeting.microphoneOnly": "Use microphone only",
  "meeting.setupTitle": "Prepare local meeting transcription?",
  "meeting.setupBody": "Ulpaso will download about {download} of pinned speech and speaker models. Setup uses up to {installed} on disk. Audio and transcripts remain on this Mac.",
  "meeting.setupNetwork": "Keep Ulpaso open and connected during the first download. Later meetings work without an Ulpaso account or server.",
  "meeting.setupInsufficientSpace": "Only {available} is available. Free at least {required} before downloading.",
  "meeting.setupCancel": "Not now",
  "meeting.setupContinue": "Download and start",
  "editor.linkPrompt": "Enter a link URL",
  "editor.label": "Markdown document editor",
  "editor.placeholder": "Start with a title, or press / for formatting",
  "editor.listening": "Listening…",
  "editor.meeting.start": "Start meeting notes",
  "editor.meeting.stop": "Stop meeting notes",
  "editor.meeting.startDescription": "Transcribe microphone and system audio on this device",
  "editor.meeting.stopDescription": "Finish the current transcript and organize speakers",
  "editor.transcript.unconfirmed": "Unconfirmed transcript text",
  "editor.slash.heading1.title": "Heading 1",
  "editor.slash.heading1.description": "Create a large section heading.",
  "editor.slash.heading2.title": "Heading 2",
  "editor.slash.heading2.description": "Create a medium section heading.",
  "editor.slash.heading3.title": "Heading 3",
  "editor.slash.heading3.description": "Create a small section heading.",
  "editor.slash.blockquote.title": "Blockquote",
  "editor.slash.blockquote.description": "Turn this block into a quote.",
  "editor.slash.code_block.title": "Code block",
  "editor.slash.code_block.description": "Create a fenced code block.",
  "editor.slash.horizontal_rule.title": "Divider",
  "editor.slash.horizontal_rule.description": "Insert a horizontal divider.",
  "editor.slash.image.title": "Image",
  "editor.slash.image.description": "Insert an image from a URL.",
  "editor.slash.image.prompt": "Image URL",
  "editor.slash.table.title": "Table",
  "editor.slash.table.description": "Insert a 3 × 3 table.",
  "editor.slash.bullet_list.title": "Bulleted list",
  "editor.slash.bullet_list.description": "Create an unordered list.",
  "editor.slash.ordered_list.title": "Numbered list",
  "editor.slash.ordered_list.description": "Create an ordered list.",
  "editor.slash.checkbox_list.title": "Task list",
  "editor.slash.checkbox_list.description": "Create a list with checkboxes.",
  "editor.slash.empty": "No matching commands.",
} as const;

type MessageKey = keyof typeof en;

const ko: Partial<Record<MessageKey, string>> = {
  "command.new": "새 문서", "command.open": "문서 열기", "command.save": "문서 저장", "command.saveAs": "다른 이름으로 저장", "command.focus": "집중 모드 전환", "command.theme": "테마 전환",
  "document.untitled": "제목 없음", "document.untitledSection": "제목 없는 섹션", "document.new": "새 문서", "document.opened": "문서를 열었습니다", "document.saved": "저장됨", "document.saving": "저장 중", "document.savingEllipsis": "저장 중…", "document.unsaved": "저장 안 됨", "document.unsavedChanges": "저장하지 않은 변경사항", "document.openDesktopOnly": "파일 열기는 데스크톱 앱에서 사용할 수 있습니다", "document.saveDesktopOnly": "파일 저장은 데스크톱 앱에서 사용할 수 있습니다", "document.openFailed": "문서를 열지 못했습니다", "document.saveFailed": "문서를 저장하지 못했습니다", "document.restored": "이전 초안을 안전하게 복원했습니다",
  "settings.title": "설정", "settings.close": "설정 닫기", "settings.appearance": "화면", "settings.appearanceDescription": "편집기 밝기", "settings.colorTheme": "색상 테마", "settings.light": "밝게", "settings.dark": "어둡게", "settings.language": "언어", "settings.languageDescription": "인터페이스 언어", "settings.meeting": "회의 기록", "settings.meetingDescription": "기기 내 전사", "settings.meetingReady": "로컬 모델 준비됨", "settings.meetingDownload": "처음 사용 시 약 {size}의 AI 모델 다운로드", "settings.audioPermissions": "오디오 권한", "settings.meetingDetection": "회의 감지 알림", "settings.meetingDetectionDescription": "회의를 감지하면 기록 전에 확인합니다", "settings.on": "켬", "settings.off": "끔", "settings.shortcuts": "키보드 단축키", "settings.shortcutsHint": "키보드 단축키 보기", "settings.shortcutsDescription": "?에 마우스를 올려 보기",
  "shortcuts.title": "키보드 단축키", "shortcuts.description": "글쓰기와 화면 이동을 빠르게 처리합니다", "shortcuts.group.document": "문서", "shortcuts.group.editing": "편집", "shortcuts.group.view": "보기 및 이동", "shortcuts.group.meeting": "회의 기록", "shortcut.undo": "실행 취소", "shortcut.redo": "다시 실행", "shortcut.bold": "굵게", "shortcut.italic": "기울임", "shortcut.inlineCode": "인라인 코드", "shortcut.strike": "취소선", "shortcut.heading1": "제목 1", "shortcut.heading2": "제목 2", "shortcut.heading3": "제목 3", "shortcut.blockMenu": "블록 메뉴 열기", "shortcut.palette": "명령 팔레트", "shortcut.settings": "설정 열기", "shortcut.sidebar": "사이드바 전환", "shortcut.dismiss": "열린 창 닫기", "shortcut.meeting": "회의 기록 시작 또는 중지",
  "sidebar.windowTools": "창 도구", "sidebar.open": "사이드바 열기", "sidebar.close": "사이드바 닫기", "sidebar.files": "파일", "sidebar.outline": "개요", "sidebar.recent": "최근 문서", "sidebar.emptyRecent": "열어 본 문서가 여기에 표시됩니다.", "sidebar.emptyOutlineLine1": "제목을 추가하면", "sidebar.emptyOutlineLine2": "여기에 개요가 만들어집니다.",
  "palette.title": "명령 팔레트", "palette.search": "명령 검색", "palette.available": "사용 가능한 명령", "palette.commands": "명령", "palette.empty": "일치하는 명령이 없습니다.", "palette.select": "선택", "palette.close": "닫기",
  "confirm.title": "변경사항을 저장할까요?", "confirm.body.new": "새 문서를 만들기 전에 작업을 저장할 수 있습니다. 저장하지 않고 계속하면 최근 변경사항이 사라집니다.", "confirm.body.open": "다른 문서를 열기 전에 작업을 저장할 수 있습니다. 저장하지 않고 계속하면 최근 변경사항이 사라집니다.", "confirm.cancel": "취소", "confirm.dontSave": "저장 안 함", "confirm.saveContinue": "저장하고 계속",
  "meeting.title": "회의 기록 · {date}", "meeting.desktopOnly": "회의 전사는 데스크톱 앱에서 사용할 수 있습니다", "meeting.finalized": "회의 기록을 화자별로 정리했습니다", "meeting.speakerWarning": "최대 4명의 화자를 정리했습니다 · 5명 이상이면 일부 음성이 합쳐질 수 있습니다", "meeting.finishing": "현재 회의 전사를 마무리하고 있습니다", "meeting.startFailed": "회의 기록을 시작하지 못했습니다", "meeting.detectionPromptTitle": "{app} 회의를 기록할까요?", "meeting.detectionPromptBody": "회의 앱이 마이크를 사용 중입니다. 확인하기 전에는 기록을 시작하지 않습니다.", "meeting.detectionPromptDismiss": "지금은 안 함", "meeting.detectionPromptStart": "기록 시작", "meeting.detectionPromptFailed": "회의 확인 창을 띄우지 못했습니다", "meeting.detectedApp": "회의 앱", "meeting.settingsFailed": "오디오 설정을 열지 못했습니다", "meeting.transcribing": "전사 중 {time}", "meeting.preparingModel": "모델 준비 중", "meeting.modelProgress": "모델 {progress}%", "meeting.permissions": "권한 확인 중", "meeting.organizing": "화자 정리 중", "meeting.organizingProgress": "화자 정리 중 {progress}%", "meeting.attention": "전사 상태를 확인해 주세요", "meeting.preparingEngine": "전사 엔진 준비 중", "meeting.stop": "회의 기록 중지", "meeting.cancel": "회의 설정 취소", "meeting.organizingNotes": "회의 기록 정리 중", "meeting.start": "회의 기록 시작", "meeting.stopOrCancel": "회의 전사 중지 또는 취소", "meeting.finishBeforeOpen": "다른 문서를 열기 전에 회의 전사를 마무리해 주세요", "meeting.finishBeforeNew": "새 문서를 만들기 전에 회의 전사를 마무리해 주세요", "meeting.errorLabel": "회의 기록 오류", "meeting.errorTitle": "전사를 시작하지 못했습니다", "meeting.errorBody": "마이크와 시스템 오디오 권한을 확인해 주세요.", "meeting.error.microphonePermission": "마이크 접근이 꺼져 있습니다. 시스템 설정에서 허용한 뒤 다시 시도해 주세요.", "meeting.error.microphoneUnavailable": "연결된 마이크를 찾지 못했습니다. 마이크를 연결하거나 시스템 오디오만 사용해 주세요.", "meeting.error.audioCapture": "오디오 접근이 거부되었거나 녹음을 시작하지 못했습니다. 시스템 설정을 확인한 뒤 다시 시도해 주세요.", "meeting.error.engine": "로컬 전사 서비스를 시작하지 못했습니다. 잠시 후 다시 시도해 주세요.", "meeting.error.recovery": "전사가 예기치 않게 중단되었습니다. 복구할 수 있도록 녹음 오디오는 안전하게 보관했습니다.", "meeting.error.localFile": "로컬 녹음 파일을 준비하지 못했습니다. 저장 공간을 확인한 뒤 다시 시도해 주세요.", "meeting.openSettings": "설정 열기", "meeting.tryAgain": "다시 시도", "meeting.systemOnly": "시스템 오디오만 사용", "meeting.microphoneOnly": "마이크만 사용", "meeting.setupTitle": "로컬 회의 전사를 준비할까요?", "meeting.setupBody": "고정된 음성·화자 모델 약 {download}를 다운로드합니다. 설치 후 최대 {installed}의 디스크 공간을 사용합니다. 오디오와 전사 내용은 이 Mac에만 남습니다.", "meeting.setupNetwork": "첫 다운로드 동안 Ulpaso를 열어 두고 네트워크 연결을 유지해 주세요. 이후에는 Ulpaso 계정이나 서버 없이 사용할 수 있습니다.", "meeting.setupInsufficientSpace": "사용 가능한 공간이 {available}뿐입니다. 다운로드 전에 최소 {required}를 확보해 주세요.", "meeting.setupCancel": "나중에", "meeting.setupContinue": "다운로드하고 시작",
  "editor.linkPrompt": "링크 URL을 입력하세요", "editor.label": "마크다운 문서 편집기", "editor.placeholder": "제목을 입력하거나 / 키로 서식을 선택하세요", "editor.listening": "듣는 중…", "editor.meeting.start": "회의 기록 시작", "editor.meeting.stop": "회의 기록 중지", "editor.meeting.startDescription": "이 기기의 마이크와 시스템 오디오를 전사합니다", "editor.meeting.stopDescription": "현재 전사를 마치고 화자를 정리합니다", "editor.transcript.unconfirmed": "확정 전 전사 텍스트",
  "editor.slash.heading1.title": "제목 1", "editor.slash.heading1.description": "큰 섹션 제목을 만듭니다.", "editor.slash.heading2.title": "제목 2", "editor.slash.heading2.description": "중간 크기 섹션 제목을 만듭니다.", "editor.slash.heading3.title": "제목 3", "editor.slash.heading3.description": "작은 섹션 제목을 만듭니다.", "editor.slash.blockquote.title": "인용문", "editor.slash.blockquote.description": "이 블록을 인용문으로 바꿉니다.", "editor.slash.code_block.title": "코드 블록", "editor.slash.code_block.description": "코드 블록을 만듭니다.", "editor.slash.horizontal_rule.title": "구분선", "editor.slash.horizontal_rule.description": "가로 구분선을 삽입합니다.", "editor.slash.image.title": "이미지", "editor.slash.image.description": "URL로 이미지를 삽입합니다.", "editor.slash.image.prompt": "이미지 URL", "editor.slash.table.title": "표", "editor.slash.table.description": "3 × 3 표를 삽입합니다.", "editor.slash.bullet_list.title": "글머리 기호 목록", "editor.slash.bullet_list.description": "순서 없는 목록을 만듭니다.", "editor.slash.ordered_list.title": "번호 목록", "editor.slash.ordered_list.description": "순서 있는 목록을 만듭니다.", "editor.slash.checkbox_list.title": "할 일 목록", "editor.slash.checkbox_list.description": "체크박스 목록을 만듭니다.", "editor.slash.empty": "일치하는 명령이 없습니다.",
};

const ja: Partial<Record<MessageKey, string>> = {
  "command.new": "新規文書", "command.open": "文書を開く", "command.save": "文書を保存", "command.saveAs": "名前を付けて保存", "command.focus": "フォーカスモード切替", "command.theme": "テーマ切替",
  "document.untitled": "無題", "document.untitledSection": "無題のセクション", "document.new": "新規文書", "document.opened": "文書を開きました", "document.saved": "保存済み", "document.saving": "保存中", "document.savingEllipsis": "保存中…", "document.unsaved": "未保存", "document.unsavedChanges": "未保存の変更", "document.openDesktopOnly": "ファイルを開く機能はデスクトップアプリで利用できます", "document.saveDesktopOnly": "ファイル保存はデスクトップアプリで利用できます", "document.openFailed": "文書を開けませんでした", "document.saveFailed": "文書を保存できませんでした", "document.restored": "前回の下書きを安全に復元しました",
  "settings.title": "設定", "settings.close": "設定を閉じる", "settings.appearance": "外観", "settings.appearanceDescription": "エディターの明るさ", "settings.colorTheme": "カラーテーマ", "settings.light": "ライト", "settings.dark": "ダーク", "settings.language": "言語", "settings.languageDescription": "インターフェース言語", "settings.meeting": "会議メモ", "settings.meetingDescription": "オンデバイス文字起こし", "settings.meetingReady": "ローカルモデル準備完了", "settings.meetingDownload": "初回利用時に約{size}のAIモデルをダウンロード", "settings.audioPermissions": "オーディオ権限", "settings.meetingDetection": "会議検出の確認", "settings.meetingDetectionDescription": "会議を検出したら記録前に確認します", "settings.on": "オン", "settings.off": "オフ", "settings.shortcuts": "キーボードショートカット", "settings.shortcutsHint": "キーボードショートカットを表示", "settings.shortcutsDescription": "?にポインターを合わせて表示",
  "shortcuts.title": "キーボードショートカット", "shortcuts.description": "執筆とナビゲーションをすばやく操作できます", "shortcuts.group.document": "文書", "shortcuts.group.editing": "編集", "shortcuts.group.view": "表示と移動", "shortcuts.group.meeting": "会議メモ", "shortcut.undo": "取り消す", "shortcut.redo": "やり直す", "shortcut.bold": "太字", "shortcut.italic": "斜体", "shortcut.inlineCode": "インラインコード", "shortcut.strike": "取り消し線", "shortcut.heading1": "見出し1", "shortcut.heading2": "見出し2", "shortcut.heading3": "見出し3", "shortcut.blockMenu": "ブロックメニューを開く", "shortcut.palette": "コマンドパレット", "shortcut.settings": "設定を開く", "shortcut.sidebar": "サイドバー切替", "shortcut.dismiss": "オーバーレイを閉じる", "shortcut.meeting": "会議メモを開始または停止",
  "sidebar.windowTools": "ウィンドウツール", "sidebar.open": "サイドバーを開く", "sidebar.close": "サイドバーを閉じる", "sidebar.files": "ファイル", "sidebar.outline": "アウトライン", "sidebar.recent": "最近の文書", "sidebar.emptyRecent": "開いた文書がここに表示されます。", "sidebar.emptyOutlineLine1": "見出しを追加すると", "sidebar.emptyOutlineLine2": "ここにアウトラインが表示されます。",
  "palette.title": "コマンドパレット", "palette.search": "コマンドを検索", "palette.available": "利用可能なコマンド", "palette.commands": "コマンド", "palette.empty": "一致するコマンドはありません。", "palette.select": "選択", "palette.close": "閉じる",
  "confirm.title": "変更を保存しますか？", "confirm.body.new": "新しい文書を作成する前に保存できます。保存せずに続行すると最新の変更は失われます。", "confirm.body.open": "別の文書を開く前に保存できます。保存せずに続行すると最新の変更は失われます。", "confirm.cancel": "キャンセル", "confirm.dontSave": "保存しない", "confirm.saveContinue": "保存して続行",
  "meeting.title": "会議メモ · {date}", "meeting.desktopOnly": "会議の文字起こしはデスクトップアプリで利用できます", "meeting.finalized": "会議メモを話者別に整理しました", "meeting.speakerWarning": "最大4人の話者を整理しました · 5人以上の場合、一部の音声が統合されることがあります", "meeting.finishing": "現在の会議文字起こしを終了しています", "meeting.startFailed": "会議メモを開始できませんでした", "meeting.detectionPromptTitle": "{app}の会議を記録しますか？", "meeting.detectionPromptBody": "会議アプリがマイクを使用しています。確認するまで記録は開始されません。", "meeting.detectionPromptDismiss": "今はしない", "meeting.detectionPromptStart": "記録を開始", "meeting.detectionPromptFailed": "会議確認画面を表示できませんでした", "meeting.detectedApp": "会議アプリ", "meeting.settingsFailed": "オーディオ設定を開けませんでした", "meeting.transcribing": "文字起こし中 {time}", "meeting.preparingModel": "モデルを準備中", "meeting.modelProgress": "モデル {progress}%", "meeting.permissions": "権限を確認中", "meeting.organizing": "話者を整理中", "meeting.organizingProgress": "話者を整理中 {progress}%", "meeting.attention": "文字起こしを確認してください", "meeting.preparingEngine": "文字起こしエンジンを準備中", "meeting.stop": "会議メモを停止", "meeting.cancel": "会議設定をキャンセル", "meeting.organizingNotes": "会議メモを整理中", "meeting.start": "会議メモを開始", "meeting.stopOrCancel": "会議文字起こしを停止またはキャンセル", "meeting.finishBeforeOpen": "別の文書を開く前に会議文字起こしを終了してください", "meeting.finishBeforeNew": "新しい文書を作る前に会議文字起こしを終了してください", "meeting.errorLabel": "会議メモのエラー", "meeting.errorTitle": "文字起こしを開始できませんでした", "meeting.errorBody": "マイクとシステムオーディオの権限を確認してください。", "meeting.error.microphonePermission": "マイクへのアクセスがオフです。システム設定で許可してから再試行してください。", "meeting.error.microphoneUnavailable": "接続されたマイクが見つかりません。マイクを接続するか、システムオーディオのみを使用してください。", "meeting.error.audioCapture": "オーディオへのアクセスが拒否されたか、録音を開始できませんでした。システム設定を確認して再試行してください。", "meeting.error.engine": "ローカル文字起こしサービスを開始できませんでした。しばらくしてから再試行してください。", "meeting.error.recovery": "文字起こしが予期せず停止しました。復旧用に録音オーディオは安全に保存されています。", "meeting.error.localFile": "ローカル録音ファイルを準備できませんでした。空き容量を確認して再試行してください。", "meeting.openSettings": "設定を開く", "meeting.tryAgain": "再試行", "meeting.systemOnly": "システムオーディオのみ使用", "meeting.microphoneOnly": "マイクのみ使用", "meeting.setupTitle": "ローカル文字起こしを準備しますか？", "meeting.setupBody": "固定された音声・話者モデル約{download}をダウンロードします。セットアップ後は最大{installed}のディスク容量を使用します。音声と文字起こしはこのMac内に残ります。", "meeting.setupNetwork": "初回ダウンロード中はUlpasoを開いたままネットワーク接続を維持してください。その後はUlpasoのアカウントやサーバーなしで利用できます。", "meeting.setupInsufficientSpace": "空き容量は{available}です。ダウンロード前に少なくとも{required}を確保してください。", "meeting.setupCancel": "後で", "meeting.setupContinue": "ダウンロードして開始",
  "editor.linkPrompt": "リンクURLを入力", "editor.label": "Markdown文書エディター", "editor.placeholder": "タイトルを入力するか、/ キーで書式を選択してください", "editor.listening": "聞き取り中…", "editor.meeting.start": "会議メモを開始", "editor.meeting.stop": "会議メモを停止", "editor.meeting.startDescription": "このデバイスのマイクとシステムオーディオを文字起こしします", "editor.meeting.stopDescription": "現在の文字起こしを終了して話者を整理します", "editor.transcript.unconfirmed": "未確定の文字起こしテキスト",
  "editor.slash.heading1.title": "見出し1", "editor.slash.heading1.description": "大きなセクション見出しを作成します。", "editor.slash.heading2.title": "見出し2", "editor.slash.heading2.description": "中サイズのセクション見出しを作成します。", "editor.slash.heading3.title": "見出し3", "editor.slash.heading3.description": "小さなセクション見出しを作成します。", "editor.slash.blockquote.title": "引用", "editor.slash.blockquote.description": "このブロックを引用に変更します。", "editor.slash.code_block.title": "コードブロック", "editor.slash.code_block.description": "コードブロックを作成します。", "editor.slash.horizontal_rule.title": "区切り線", "editor.slash.horizontal_rule.description": "水平の区切り線を挿入します。", "editor.slash.image.title": "画像", "editor.slash.image.description": "URLから画像を挿入します。", "editor.slash.image.prompt": "画像URL", "editor.slash.table.title": "表", "editor.slash.table.description": "3 × 3の表を挿入します。", "editor.slash.bullet_list.title": "箇条書き", "editor.slash.bullet_list.description": "順序なしリストを作成します。", "editor.slash.ordered_list.title": "番号付きリスト", "editor.slash.ordered_list.description": "順序付きリストを作成します。", "editor.slash.checkbox_list.title": "タスクリスト", "editor.slash.checkbox_list.description": "チェックボックス付きリストを作成します。", "editor.slash.empty": "一致するコマンドはありません。",
};

const dictionaries: Record<Locale, Partial<Record<MessageKey, string>>> = { en, ko, ja };

function readInitialLocale(): Locale {
  try {
    const saved = globalThis.localStorage?.getItem(LOCALE_STORAGE_KEY);
    return saved === "ko" || saved === "ja" || saved === "en" ? saved : "en";
  } catch {
    return "en";
  }
}

const [locale, setLocaleSignal] = createSignal<Locale>(readInitialLocale());

function applyDocumentLanguage(next: Locale) {
  if (typeof document !== "undefined") document.documentElement.lang = next;
}

applyDocumentLanguage(locale());

function setLocale(next: Locale) {
  setLocaleSignal(next);
  applyDocumentLanguage(next);
  try { globalThis.localStorage?.setItem(LOCALE_STORAGE_KEY, next); } catch { /* storage may be unavailable */ }
}

function t(key: MessageKey, params?: MessageParams): string {
  const template = dictionaries[locale()][key] ?? en[key];
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? `{${name}}`));
}

export { locale, localeLabels, setLocale, t };
export type { Locale, MessageKey };
