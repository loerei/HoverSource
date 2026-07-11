const ESC = "\x1b[";
const RESET = `${ESC}0m`;

const COLORS = {
  cyan: `${ESC}36m`,
  green: `${ESC}32m`,
  yellow: `${ESC}33m`,
  red: `${ESC}31m`,
  gray: `${ESC}90m`,
};

// Lưu trữ các hàm console gốc
export const originalLog = console.log;
export const originalWarn = console.warn;
export const originalError = console.error;

function format(color: string, prefix: string, msg: string): string {
  // Loại bỏ các tag prefix [HoverSource] và ký tự xuống dòng, mã màu ANSI cũ, emoji
  const cleanMsg = msg
    .replace(/\x1b\[[0-9;]*m/g, "") // Xóa tất cả mã màu ANSI cũ
    .replace(/^\[HoverSource[^\]]*\]\s*/i, "")
    .replace(/^⚠️\s*/, "")
    .replace(/^ℹ️\s*/, "")
    .replace(/^✅\s*/, "")
    .trim();
  
  // Giữ lại ký tự xuống dòng ở đầu nếu có
  const hasLeadingNewline = msg.startsWith("\n") || msg.startsWith("\r\n") || msg.includes("\x1b[31m\n");
  const leading = hasLeadingNewline ? "\n" : "";

  return `${leading}${color}${prefix}${RESET} ${cleanMsg}`;
}

export const logger = {
  info(msg: string) {
    originalLog(format(COLORS.cyan, "◇ hs", msg));
  },
  success(msg: string) {
    originalLog(format(COLORS.green, "✔ hs", msg));
  },
  warn(msg: string) {
    originalWarn(format(COLORS.yellow, "⚠ hs", msg));
  },
  error(msg: string) {
    originalError(format(COLORS.red, "✖ hs", msg));
  },
  debug(msg: string) {
    if (process.env.DEBUG || process.env.NODE_ENV === "development") {
      originalLog(format(COLORS.gray, "● hs [debug]", msg));
    }
  }
};

// Kiểm tra xem log có thuộc về HoverSource không (kể cả có ANSI color hay xuống dòng phía trước)
function isHoverSourceLog(val: unknown): boolean {
  if (typeof val !== "string") return false;
  // Loại bỏ ANSI code và check xem có chứa [HoverSource]
  const cleanVal = val.replace(/\x1b\[[0-9;]*m/g, "");
  return /\[HoverSource\]/.test(cleanVal);
}

// Hàm cài đặt monkeypatch toàn cục
export function setupConsoleMonkeypatch(): void {
  console.log = (...args: unknown[]): void => {
    if (args.length > 0 && isHoverSourceLog(args[0])) {
      const msg = args[0] as string;
      const rest = args.slice(1);
      if (
        msg.toLowerCase().includes("success") || 
        msg.toLowerCase().includes("free") || 
        msg.toLowerCase().includes("restarted") || 
        msg.toLowerCase().includes("patched")
      ) {
        logger.success(msg);
      } else {
        logger.info(msg);
      }
      if (rest.length > 0) {
        originalLog(...rest);
      }
    } else {
      originalLog(...args);
    }
  };

  console.warn = (...args: unknown[]): void => {
    if (args.length > 0 && isHoverSourceLog(args[0])) {
      const msg = args[0] as string;
      const rest = args.slice(1);
      logger.warn(msg);
      if (rest.length > 0) {
        originalWarn(...rest);
      }
    } else {
      originalWarn(...args);
    }
  };

  console.error = (...args: unknown[]): void => {
    if (args.length > 0 && isHoverSourceLog(args[0])) {
      const msg = args[0] as string;
      const rest = args.slice(1);
      logger.error(msg);
      if (rest.length > 0) {
        originalError(...rest);
      }
    } else {
      originalError(...args);
    }
  };
}
