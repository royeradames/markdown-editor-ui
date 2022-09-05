import {Component, OnInit} from '@angular/core';
import {UntypedFormControl, UntypedFormGroup} from "@angular/forms";
import {MatDialog} from "@angular/material/dialog";
import {OnDeleteDialogComponent} from "./on-delete/on-delete-dialog.component";

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit {

  constructor(public dialog: MatDialog) {
  }

  form = new UntypedFormGroup({
    themeToggle: new UntypedFormControl(false)
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


  onDelete() {
    console.log('onDelete');
    const dialogRef = this.dialog.open(OnDeleteDialogComponent, {
      width: '343px',
    });

    dialogRef.afterClosed().subscribe((result: undefined | true) => {
      console.log(result);
      console.log('The dialog was closed');
    });
  }
}
