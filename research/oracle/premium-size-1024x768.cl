;;; Disposable probe: combine the real license branch with the image-size
;;; variables retained in the delivered Lisp image.  No proprietary code is
;;; reconstructed here; the script only sets named special variables before
;;; the normal application startup.
(in-package :cl-user)

(dolist (entry '(("*BUILD-PREMIUM*" . t)
                 ("SMALL-IMAGE-SCREEN-WIDTH" . 1024)
                 ("SMALL-IMAGE-SCREEN-HEIGHT" . 768)))
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
  (write-line "premium size override loaded" marker)
  (finish-output marker))
