# HoverSource Benchmark Logs

This directory contains the detailed execution logs, benchmark reports, and visualization charts comparing the performance of AI coding agents under different instruction/prompting strategies.

## Benchmark Methodology

We evaluate the performance of an AI coding agent (Gemini 3.5 Flash) on style modification and minor layout tasks across three distinct prompting variants:

1. **Prompt A: Pure Natural Language (No Context)**
   * Simulates a developer who does not know the codebase. The prompt describes the visual goal in plain human language without mentioning specific files, classes, or coordinates.
2. **Prompt B: Senior Developer Context (Manual Search Helper)**
   * Simulates a senior developer pointing the agent to the right place. The prompt includes manual file paths and component names but leaves the exact element coordinates/CSS selectors open-ended.
3. **Prompt C: HoverSource Component Metadata (Automatic Clipboard)**
   * Pares the natural language instruction with the full structured **Component Metadata** block copied directly from the HoverSource inspector overlay (`Alt + C`). This block provides exact element selectors, file paths, dimensions, layout constraints, and parent/key styles.

---

## Directory Structure

```
benchmark-logs/
├── README.md                  # This file (overview)
├── generate_chart.py          # Python script to compile and plot metrics
├── calcom/                    # Benchmark 1: Cal.com Monorepo (~7,700 source files)
│   ├── calcom-benchmark.md    # Consolidated summary and task-by-task breakdown
│   ├── calcom-benchmark-chart.png # High-resolution line chart comparing time and tokens
│   └── logs/                  # Raw step-by-step agent transcripts (Tasks 1-10)
└── yumeshelf/                 # Benchmark 2: YumeShelf Electron App (~200 source files)
    ├── yumeshelf-benchmark.md # Consolidated summary and task-by-task breakdown
    ├── yumeshelf-benchmark-chart.png # High-resolution line chart comparing time and tokens
    └── logs/                  # Raw step-by-step agent transcripts (Tasks 11-15)
```

---

## Detailed Reports

To view the consolidated summaries, task goals, metric comparisons, and delta gains, refer to:

* **[Cal.com Monorepo Benchmark Report (10 Tasks)](calcom/calcom-benchmark.md)**
* **[YumeShelf Electron App Benchmark Report (5 Tasks)](yumeshelf/yumeshelf-benchmark.md)**

## Generating Charts

The visualization charts in the subdirectories are compiled and generated using the Matplotlib scripts:
* To generate Cal.com chart: `python benchmark-logs/generate_chart.py`
* To generate YumeShelf chart: Run the helper generation script `generate_yumeshelf_chart.py` located in the agent scratch directory.

---

## Phân tích bản chất phương pháp Prompt & Đánh giá chuyên sâu

### Phân tích bản chất phương pháp

* **Prompt B (Senior Developer Context):** Đây là cách tiếp cận dựa trên **kinh nghiệm và trực giác định hướng của con người**. Lập trình viên có kinh nghiệm sẽ "chỉ điểm" cho AI các đường dẫn tệp (file path) và tên component cụ thể, nhưng để ngỏ các thuộc tính chi tiết như CSS selector hoặc tọa độ phần tử để AI tự tìm kiếm.
* **Prompt C (HoverSource Metadata):** Đây là cách tiếp cận dựa trên **dữ liệu cấu trúc tự động của máy móc**. Thay vì con người phải tự đi lùng sục mã nguồn, HoverSource cung cấp một khối thông tin Component Metadata chuẩn xác được trích xuất trực tiếp từ giao diện (qua phím tắt `Alt + C`), bao gồm tệp nguồn, dòng code, CSS selector chính xác, kích thước, ràng buộc bố cục (layout constraints) và style của thẻ cha.

---

### So sánh hiệu năng qua số liệu Benchmark

Qua kết quả đo lường trên hai dự án Cal.com (Monorepo lớn với hơn 7.700 tệp) và YumeShelf (Ứng dụng Electron khoảng 200 tệp), hiệu năng của hai phương pháp có sự khác biệt rõ rệt:

#### 1. Thời gian thực thi (Execution Time) — HoverSource chiếm ưu thế lớn
* **Trên dự án lớn (Cal.com):** Senior Dev Prompt (B) mất trung bình **44.2 giây** để hoàn thành tác vụ, trong khi HoverSource (C) chỉ mất **16.4 giây** (nhanh hơn gấp 2.7 lần).
* **Trên dự án nhỏ (YumeShelf):** HoverSource đạt thời gian thực thi trung bình là **24.8 giây**, tối ưu hơn mức **38.8 giây** của Senior Dev.
* *Lý do:* Khối lượng Metadata chính xác giúp AI bỏ qua hoàn toàn bước "suy nghĩ" để tìm kiếm selector hoặc phân tích cấu trúc DOM, giảm thiểu tối đa độ trễ.

#### 2. Lượng Token tiêu thụ (Cumulative Input Tokens) — Sự đánh đổi kinh tế
* **Trên dự án lớn (Cal.com):** Lượng token tiêu thụ khá tương đương (Senior Dev ~37.8k tokens so với HoverSource ~35.7k tokens).
* **Trên dự án nhỏ (YumeShelf):** Senior Dev (B) lại tiết kiệm token hơn (**44,382 tokens**) so với HoverSource (**61,255 tokens**).
* *Lý do:* Khối rập khuôn Metadata của HoverSource chứa rất nhiều thông tin chi tiết về style cha/con và ràng buộc layout, điều này làm tăng lượng token đầu vào (Input Token) ban đầu. Tuy nhiên, nó giúp giảm đáng kể "Peak Context" (Context đỉnh điểm) trong các dự án phức tạp.

---

### Phân tích sâu về chất lượng mã nguồn tạo ra (Code Elegance)

Điểm khác biệt cốt lõi giữa hai phương pháp không nằm ở những con số, mà nằm ở **tư duy kiến trúc mã nguồn** mà AI lựa chọn để giải quyết vấn đề:

#### Hạn chế định hướng của Senior Dev Prompt
Khi một Senior Dev chỉ định rõ cho AI rằng *"Hãy sửa lỗi này trong file src/renderer/stack-cards.ts"*, AI sẽ bị đóng khung tư duy và ép bản thân phải tìm cách giải quyết ngay trong tệp đó.
* **Hệ quả thực tế (Task 11 & Task 14):** Thay vì tìm file CSS gốc để chỉnh sửa quy tắc hiển thị, AI của Senior Dev đã chọn giải pháp "sửa thô" bằng cách viết các hàm lắng nghe sự kiện bằng JavaScript (`onmouseover`, `onmouseout`) để ép chèn inline style trực tiếp vào DOM. Điều này khiến mã nguồn trở nên cồng kềnh, phá vỡ cấu trúc và vi phạm nguyên tắc tách biệt logic - giao diện của dự án.

#### Sự tự tin kiến trúc của HoverSource Prompt
Vì HoverSource cung cấp cả thông tin về tệp nguồn lẫn Selector CSS gốc (`.fav-btn.active`), AI có cái nhìn toàn cảnh và biết chính xác thuộc tính giao diện đang nằm ở đâu.
* **Kết quả thực tế:** Thay vì can thiệp thô bạo vào logic JavaScript, AI tìm thẳng đến các tệp stylesheet gốc (`src/styles/game-cards.css` hoặc `menus-tooltips.css`) và sửa đổi trực tiếp các quy tắc CSS native. Giải pháp này sạch sẽ, thanh thoát và tôn trọng thiết kế kiến trúc ban đầu của hệ thống.

---

### Trường hợp ngoại lệ (Edge Cases)

Mặc dù HoverSource tối ưu hơn trong phần lớn kịch bản, Senior Dev Prompt vẫn chứng minh giá trị vượt trội trong các tác vụ cực kỳ đơn giản và mang tính cục bộ.
* **Tại Task 15 (YumeShelf):** Khi cần cập nhật hành vi của một liên kết trong phần cài đặt, việc Senior Dev "chỉ điểm" trực tiếp file logic giúp AI xử lý chỉ trong **5 giây** và tiêu tốn chưa đầy **10k tokens**. Trong khi đó, việc nạp một lượng lớn Metadata của HoverSource khiến AI mất tới **14 giây** và tiêu thụ gấp gần 5 lần số token (~48k tokens) chỉ để giải quyết một dòng code cơ bản.

---

### Tổng kết

* **Senior Dev Prompt** hoạt động dựa trên trí tuệ và kinh nghiệm tổng thể của con người. Nó rất hiệu quả và tiết kiệm chi phí đối với các tác vụ nhỏ, biệt lập. Tuy nhiên, nó dễ khiến AI bị "bó hẹp" không gian giải pháp và sinh ra các đoạn code vá (workaround) bằng JS kém thanh thoát.
* **HoverSource Metadata** đại diện cho sự chính xác cơ khí tuyệt đối. Bằng cách cung cấp dữ liệu DOM và CSS chính xác, nó giúp AI tối ưu hóa thời gian thực thi, đưa ra các giải pháp chuẩn kiến trúc (sửa CSS gốc thay vì viết JS chèn inline style), đặc biệt mạnh mẽ trong các dự án Monorepo lớn hoặc cấu trúc giao diện phức tạp.
