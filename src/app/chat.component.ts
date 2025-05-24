import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpClientModule } from '@angular/common/http';

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [CommonModule, FormsModule, HttpClientModule],
  templateUrl: './chat.component.html',
  styleUrl: './chat.component.scss',
})
export class ChatComponent {
  messages: { role: string; content: string }[] = [];
  userInput = '';
  loading = false;
  error: string | null = null;

  constructor(private http: HttpClient) {}

  async sendMessage() {
    if (!this.userInput.trim()) return;
    this.messages.push({ role: 'user', content: this.userInput });
    const currentInput = this.userInput;
    this.userInput = '';
    this.loading = true;
    this.error = null;
    try {
      const res: any = await this.http
        .post('/api/openrouter-chat', {
          messages: this.messages,
          model: 'qwen/qwen3-32b', // Replace with your model name
        })
        .toPromise();
      const aiMsg = res?.choices?.[0]?.message?.content || 'No response';
      this.messages.push({ role: 'assistant', content: aiMsg });
    } catch (err: any) {
      this.error = err?.error?.error || 'Error contacting chat API';
      // Remove last user message if failed
      this.messages = this.messages.filter(
        (m, i) => i !== this.messages.length - 1 || m.role !== 'user' || m.content !== currentInput
      );
    } finally {
      this.loading = false;
    }
  }
}
