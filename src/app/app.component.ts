import {Component, OnDestroy, OnInit} from '@angular/core';
import {FormControl, FormGroup, Validators} from "@angular/forms";
import {MatDialog} from "@angular/material/dialog";
import {OnDeleteDialogComponent} from "./on-delete/on-delete-dialog.component";
import {docs} from './docs'
import {Subscription} from "rxjs";
import {DocModel} from "./model/doc-model";
import {DocFormModel} from "./model/doc-form-model";

@Component({
  selector: 'app-root', templateUrl: './app.component.html', styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit, OnDestroy {
  isEdit = true;
  form = new FormGroup<DocFormModel>({
    themeToggle: new FormControl(false, {nonNullable: true}),
    title: new FormControl('', {nonNullable: true}),
    content: new FormControl('', {nonNullable: true}),
  }, {validators: [Validators.required]});
  docs = docs;
  currentDoc: DocModel = this.docs[1]
  formSubscriptions$ = new Subscription();

  constructor(public dialog: MatDialog) {
  }

  goToDoc(doc: DocModel) {
    this.currentDoc = doc;
    this.form.controls.title.setValue(this.currentDoc.title)
    this.form.controls.content.setValue(this.currentDoc.content)

  }

  ngOnInit(): void {
    this.form.controls.title.setValue(this.currentDoc.title)
    this.form.controls.content.setValue(this.currentDoc.content)
    this.formSubscriptions()
  }

  onDelete() {
    const dialogRef = this.dialog.open(OnDeleteDialogComponent, {
      width: '343px',
    });

    dialogRef.afterClosed().subscribe((_result: undefined | true) => {
      this.docs = this.docs.filter(doc => doc.id !== this.currentDoc.id)
      //todo: what to do when you delete a doc?
      this.currentDoc = {id: 0, title: '', content: '', date: ''}
      this.form.patchValue({title: '', content: ''})
    });
  }

  onReady() {
    console.log('onReady');
  }

  onAdd() {
    this.docs.push({
      id: this.docs.length + 1,
      title: this.form.value.title! || 'New Doc.md',
      content: this.form.value.content! || '#New Doc Content',
      date: new Date().toDateString()
    })
    this.currentDoc = this.docs[this.docs.length - 1]
  }

  onSave() {
    const currentDocIndex = this.docs.findIndex(doc => doc.id === this.currentDoc.id)

    if (currentDocIndex !== -1) {
      this.docs.splice(currentDocIndex, 1, this.currentDoc)
      return
    }

    this.onAdd()
  }

  ngOnDestroy(): void {
    this.formSubscriptions$.unsubscribe()
  }

  private formSubscriptions() {
    this.formSubscriptions$.add(this.form.controls.themeToggle.valueChanges.subscribe(() => {
      console.log('themeToggle')
    }))
    this.formSubscriptions$.add(this.form.controls.content.valueChanges.subscribe(value => {
      this.currentDoc.content = value
    }))
    this.formSubscriptions$.add(this.form.controls.title.valueChanges.subscribe(value => {
      this.currentDoc.title = value
    }))
  }
}
