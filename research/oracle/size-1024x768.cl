;;; Disposable probe for the small-image dimension variables only.
(in-package :cl-user)

(dolist (entry '(("SMALL-IMAGE-SCREEN-WIDTH" . 1024)
                 ("SMALL-IMAGE-SCREEN-HEIGHT" . 768)))
  (let ((name (car entry))
        (value (cdr entry)))
    (do-all-symbols (symbol)
      (when (and (string-equal name (symbol-name symbol))
                 (not (constantp symbol)))
        (handler-case
            (set symbol value)
          (condition () nil))))))

(with-open-file (marker "C:\\temp\\aaron-size-loaded.txt"
                       :direction :output
                       :if-exists :supersede
                       :if-does-not-exist :create)
  (write-line "size override loaded" marker)
  (finish-output marker))
