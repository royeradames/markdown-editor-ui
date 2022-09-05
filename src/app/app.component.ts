import {Component, OnInit} from '@angular/core';
import {UntypedFormControl, UntypedFormGroup} from "@angular/forms";
import {MatDialog} from "@angular/material/dialog";
import {OnDeleteDialogComponent} from "./on-delete/on-delete-dialog.component";
import {DocInterface, docs} from './docs'

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit {
  isEdit = true;
  form = new UntypedFormGroup({
    themeToggle: new UntypedFormControl(false)
  })
  docs = docs;
  currentDoc: DocInterface = this.docs[1]


  constructor(public dialog: MatDialog) {
  }

  goToDoc(doc: DocInterface) {
    this.currentDoc = doc;
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

    dialogRef.afterClosed().subscribe((_result: undefined | true) => {
      this.docs = this.docs.filter(doc => doc.id !== this.currentDoc.id)
      //todo: what to do when you delete a doc?
      this.currentDoc = {id: 0, title: '', content: '', date: ''}
    });
  }

  onReady() {
    console.log('onReady');
  }

  onAdd() {
    console.log('onAdd');
    this.docs.push({
      id: this.docs.length + 1,
      title: 'New Doc.md',
      content: '#New Doc Content',
      date: new Date().toDateString()
    })
    this.currentDoc = this.docs[this.docs.length - 1]
  }
}
