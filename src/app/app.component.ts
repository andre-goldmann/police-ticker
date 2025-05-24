import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { RssFeedComponent } from './rss-feed.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RssFeedComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  title = 'police-ticker';
}
