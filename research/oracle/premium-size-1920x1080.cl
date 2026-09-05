;;; Disposable probe for a larger compact/gallery canvas.
(in-package :cl-user)

(dolist (entry '(("*BUILD-PREMIUM*" . t)
                 ("SMALL-IMAGE-SCREEN-WIDTH" . 1920)
                 ("SMALL-IMAGE-SCREEN-HEIGHT" . 1080)))
  (let ((name (car entry))
        (value (cdr entry)))
    (do-all-symbols (symbol)
      (when (and (string-equal name (symbol-name symbol))
                 (not (constantp symbol)))
        (handler-case
            (set symbol value)
          (condition () nil))))))

(with-open-file (marker "C:\\temp\\aaron-premium-size-loaded.txt"
                       :direction :output
                       :if-exists :supersede
                       :if-does-not-exist :create)
  (write-line "premium size 1920x1080 override loaded" marker)
  (finish-output marker))
