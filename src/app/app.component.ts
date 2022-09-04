import {Component, OnInit} from '@angular/core';
import {FormControl, FormGroup} from "@angular/forms";

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit {
  title = 'my-sassy-app';

  form = new FormGroup({
    themeToggle: new FormControl(false)
  })
  docs = [
    {
      date: '2020-01-01',
      name: 'untitled-document.md',
    },
    {
      date: '2010-01-01',
      name: 'welcome.md',
    },
  ]
  goToDoc() {
    console.log('go to doc');
  }

  ngOnInit(): void {
    this.form.controls['themeToggle'].valueChanges.subscribe(() => {
      console.log('themeToggle')
    })
  }
}
