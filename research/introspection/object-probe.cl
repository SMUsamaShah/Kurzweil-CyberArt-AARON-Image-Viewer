;;; Bounded, read-only inspection of callable objects. DISASSEMBLE in this
;;; image is an autoload stub whose disasm.fasl was not distributed.
(in-package :cl-user)
(unless (boundp 'aaron-object-probe-loaded)
  (set 'aaron-object-probe-loaded t)
  (with-open-file (report "C:\\temp\\aaron-object-probe.txt"
                          :direction :output :if-exists :supersede
                          :if-does-not-exist :create)
    (let ((*print-length* 25) (*print-level* 6) (*print-circle* t)
          (*standard-output* report)
          (arglist (find-symbol "ARGLIST" "EXCL")))
      (format report "BEGIN object-probe~%")
      (finish-output report)
      (dolist (name '("FUNCTION-CONSTANT-COUNT" "FUNCTION-CONSTANT"
                      "MEMREF" "MEMREF-INT" "LISPVAL-OTHER-TO-ADDRESS"
                      "POINTER-TO-ADDRESS" "MDPARAM"))
        (do-all-symbols (symbol)
          (when (and (string= name (symbol-name symbol)) (fboundp symbol))
            (format report "HELPER ~S package=~S~%" name
                    (package-name (symbol-package symbol)))
            (finish-output report)
            (handler-case
                (format report "ARGLIST ~S~%"
                        (multiple-value-list (funcall arglist symbol)))
              (error (problem) (format report "ERROR ~A~%" problem)))
            (finish-output report))))
      (dolist (name '("RAN" "INIT-RANDOM" "SET-RANDOM" "GET-RANDOM"
                      "SET-UP-SCREEN-SIZE" "SELECT-CANVAS"))
        (format report "TRY object ~S~%" name)
        (finish-output report)
        (let* ((symbol (find-symbol name "COMMON-GRAPHICS-USER"))
               (fn (symbol-function symbol)))
          ;; Printing a generic function or DESCRIBE can enter unavailable
          ;; runtime facilities. Do not invoke either while locating headers.
          (format report "BEGIN object ~S type=~S~%" name (type-of fn))
          (finish-output report)
          (let ((memref (find-symbol "MEMREF" "SYSTEM")))
            (when (and (eq (type-of fn) 'compiled-function)
                       memref (fboundp memref))
              (format report "HEADER ")
              (finish-output report)
              (handler-case
                  (dotimes (i 64)
                    (format report "~2,'0X" (funcall memref fn 0 i :unsigned-byte)))
                (error (problem) (format report " ERROR memref ~A" problem)))
              (terpri report)
              (finish-output report)))
          (format report "END object ~S~%" name)
          (finish-output report)))
      (format report "END object-probe~%")
      (finish-output report))))
