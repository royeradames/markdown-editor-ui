import {FormControl} from "@angular/forms";

export interface DocFormModel {
  themeToggle: FormControl<boolean>;
  title: FormControl<string>,
  content: FormControl<string>,
}
