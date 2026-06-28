import os
import matplotlib.pyplot as plt
import numpy as np

# Data for completed tasks
tasks = ["Task 1", "Task 2", "Task 3", "Task 4", "Task 5", "Task 6", "Task 7", "Task 8", "Task 9", "Task 10"]

# Metrics for each prompt variant
# Prompt A: Pure Natural Language
# Prompt B: Senior Developer Context
# Prompt C: HoverSource Metadata
time_a = [271, 51, 46, 65, 132, 154, 115, 137, 166, 283]
time_b = [88, 11, 18, 169, 8, 7, 109, 8, 8, 16]
time_c = [20, 7, 18, 10, 12, 18, 25, 12, 8, 34]

tokens_a = [557132, 197226, 74535, 29604, 394524, 229086, 465434, 932759, 314581, 3321931]
tokens_b = [78703, 17143, 23355, 133522, 11686, 16046, 28607, 5714, 14514, 49285]
tokens_c = [39401, 19209, 27613, 8730, 8209, 35428, 37441, 10782, 6938, 163583]

context_a = [28868, 23335, 11868, 8022, 23956, 14934, 30272, 51886, 17685, 71744]
context_b = [10265, 5874, 8130, 12509, 6243, 7332, 4297, 3105, 4529, 11431]
context_c = [8101, 5644, 5222, 3914, 3930, 6705, 7773, 3777, 2711, 17078]

# Set up the dark theme styling
plt.style.use('dark_background')
fig, (ax1, ax2, ax3) = plt.subplots(1, 3, figsize=(18, 5))
fig.suptitle("Cal.com Agent Benchmark Results", fontsize=16, fontweight='bold', color='#e0e0e0', y=0.98)

# Color palette
color_a = '#ff5252'  # Soft red
color_b = '#ffd740'  # Soft gold/yellow
color_c = '#69f0ae'  # Soft green

# Plot 1: Execution Time
ax1.plot(tasks, time_a, marker='o', linewidth=2, color=color_a, label="Prompt A (Natural Language)")
ax1.plot(tasks, time_b, marker='o', linewidth=2, color=color_b, label="Prompt B (Senior Dev)")
ax1.plot(tasks, time_c, marker='o', linewidth=2, color=color_c, label="Prompt C (HoverSource)")

# Add Horizontal Average Lines for Plot 1
ax1.axhline(np.mean(time_a), color=color_a, linestyle='--', linewidth=1, alpha=0.5, label="Avg A")
ax1.axhline(np.mean(time_b), color=color_b, linestyle='--', linewidth=1, alpha=0.5, label="Avg B")
ax1.axhline(np.mean(time_c), color=color_c, linestyle='--', linewidth=1, alpha=0.5, label="Avg C")

# Add labels and styling for Plot 1
ax1.set_title("Execution Time (Seconds) - Lower is Better", fontsize=12, color='#b0b0b0', pad=10)
ax1.set_ylabel("Time (s)", fontsize=10, color='#b0b0b0')
ax1.grid(True, linestyle='--', alpha=0.3, color='#444444')
ax1.tick_params(colors='#b0b0b0')
ax1.set_ylim(bottom=0, top=max(time_a) * 1.15)

# Plot 2: Cumulative Input Tokens
ax2.plot(tasks, tokens_a, marker='o', linewidth=2, color=color_a, label="Prompt A (Natural Language)")
ax2.plot(tasks, tokens_b, marker='o', linewidth=2, color=color_b, label="Prompt B (Senior Dev)")
ax2.plot(tasks, tokens_c, marker='o', linewidth=2, color=color_c, label="Prompt C (HoverSource)")

# Add Horizontal Average Lines for Plot 2
ax2.axhline(np.mean(tokens_a), color=color_a, linestyle='--', linewidth=1, alpha=0.5)
ax2.axhline(np.mean(tokens_b), color=color_b, linestyle='--', linewidth=1, alpha=0.5)
ax2.axhline(np.mean(tokens_c), color=color_c, linestyle='--', linewidth=1, alpha=0.5)

# Add labels and styling for Plot 2
ax2.set_title("Cumulative Input Tokens - Lower is Better", fontsize=12, color='#b0b0b0', pad=10)
ax2.set_ylabel("Tokens", fontsize=10, color='#b0b0b0')
ax2.grid(True, linestyle='--', alpha=0.3, color='#444444')
ax2.tick_params(colors='#b0b0b0')
ax2.get_yaxis().set_major_formatter(plt.FuncFormatter(lambda x, loc: "{:,}".format(int(x))))
ax2.set_ylim(bottom=0, top=max(tokens_a) * 1.15)

# Plot 3: Peak Context Window
ax3.plot(tasks, context_a, marker='o', linewidth=2, color=color_a, label="Prompt A (Natural Language)")
ax3.plot(tasks, context_b, marker='o', linewidth=2, color=color_b, label="Prompt B (Senior Dev)")
ax3.plot(tasks, context_c, marker='o', linewidth=2, color=color_c, label="Prompt C (HoverSource)")

# Add Horizontal Average Lines for Plot 3
ax3.axhline(np.mean(context_a), color=color_a, linestyle='--', linewidth=1, alpha=0.5)
ax3.axhline(np.mean(context_b), color=color_b, linestyle='--', linewidth=1, alpha=0.5)
ax3.axhline(np.mean(context_c), color=color_c, linestyle='--', linewidth=1, alpha=0.5)

# Add labels and styling for Plot 3
ax3.set_title("Peak Context Window (Tokens) - Lower is Better", fontsize=12, color='#b0b0b0', pad=10)
ax3.set_ylabel("Tokens", fontsize=10, color='#b0b0b0')
ax3.grid(True, linestyle='--', alpha=0.3, color='#444444')
ax3.tick_params(colors='#b0b0b0')
ax3.get_yaxis().set_major_formatter(plt.FuncFormatter(lambda x, loc: "{:,}".format(int(x))))
ax3.set_ylim(bottom=0, top=max(context_a) * 1.15)

# Add legend to the figure
handles, labels = ax1.get_legend_handles_labels()
fig.legend(handles, labels, loc='lower center', ncol=3, frameon=True, facecolor='#1e1e1e', edgecolor='#333333', bbox_to_anchor=(0.5, -0.05))

plt.tight_layout(rect=[0, 0.05, 1, 0.95])

# Save the figure
output_path = os.path.join(os.path.dirname(__file__), "calcom", "calcom-benchmark-chart.png")
plt.savefig(output_path, dpi=300, bbox_inches='tight', facecolor='#121212')
print(f"Chart successfully saved to {output_path}")
