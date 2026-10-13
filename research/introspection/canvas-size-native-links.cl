;;; Read-only startup metadata for AARON's two canvas-selection functions.
;;; Headers and constants are candidates; they do not prove dynamic calls.
(in-package :cl-user)

(unless (boundp 'aaron-canvas-size-native-links-loaded)
  (set 'aaron-canvas-size-native-links-loaded t)
  (let ((function-count 0) (errors 0) (truncated 0))
    (with-open-file (report "C:\\temp\\aaron-canvas-size-native-links.txt"
                            :direction :output :if-exists :supersede
                            :if-does-not-exist :create)
      (let* ((*print-length* 16) (*print-level* 5) (*print-circle* nil)
             (*print-pretty* nil) (*print-readably* nil)
             (owner (find-package "COMMON-GRAPHICS-USER"))
             (arglist-helper (find-symbol "ARGLIST" "EXCL"))
             (count-helper (find-symbol "FUNCTION-CONSTANT-COUNT" "EXCL"))
             (constant-helper (find-symbol "FUNCTION-CONSTANT" "EXCL"))
             (memref (find-symbol "MEMREF" "SYSTEM")))
        (labels
            ((short-value (value)
               (cond ((symbolp value)
                      (list :symbol (and (symbol-package value)
                                         (package-name (symbol-package value)))
                            (symbol-name value)))
                     ((numberp value) (list :number value))
                     ((typep value 'compiled-function)
                      (list :compiled-function))
                     ((stringp value) (list :string (length value)))
                     (t (list :type (type-of value)))))
             (record-error (name stage problem)
               (incf errors)
               (format report "ERROR name=~S stage=~A type=~S~%"
                       name stage (type-of problem))
               (finish-output report))
             (function-info (name)
               (let* ((symbol (and owner (find-symbol name owner)))
                      (function (and symbol (fboundp symbol)
                                     (symbol-function symbol))))
                 (cond
                   ((null function)
                    (incf errors)
                    (format report "ERROR name=~S stage=LOOKUP type=:MISSING-FUNCTION~%"
                            name))
                   (t
                    (incf function-count)
                    (format report "FUNCTION name=~S type=~S~%"
                            name (type-of function))
                    (when arglist-helper
                      (handler-case
                          (format report "ARGLIST name=~S values=~S~%"
                                  name (multiple-value-list
                                        (funcall arglist-helper function)))
                        (error (problem)
                          (record-error name "ARGLIST" problem))))
                    (if (not (typep function 'compiled-function))
                        (progn
                          (incf errors)
                          (format report "ERROR name=~S stage=TYPE type=~S~%"
                                  name (type-of function)))
                      (progn
                        (if memref
                            (handler-case
                                (progn
                                  (format report "HEADER name=~S bytes=" name)
                                  (dotimes (index 64)
                                    (format report "~2,'0X"
                                            (funcall memref function 0 index
                                                     :unsigned-byte)))
                                  (terpri report))
                              (error (problem)
                                (record-error name "HEADER" problem)))
                          (record-error name "HEADER" :helper-unavailable))
                        (if (and count-helper constant-helper)
                            (handler-case
                                (let ((count (funcall count-helper function)))
                                  (format report "CONSTANT-COUNT name=~S count=~D~%"
                                          name count)
                                  (if (and (integerp count) (<= 0 count 4096))
                                      (dotimes (index count)
                                        (handler-case
                                            (format report
                                                    "CONSTANT name=~S index=~D value=~S~%"
                                                    name index
                                                    (short-value
                                                     (funcall constant-helper
                                                              function index)))
                                          (error (problem)
                                            (record-error name "CONSTANT" problem))))
                                    (incf truncated)))
                              (error (problem)
                                (record-error name "CONSTANTS" problem)))
                          (record-error name "CONSTANTS" :helper-unavailable))))
                    (finish-output report))))))
          (format report "BEGIN canvas-size-native-links~%")
          (finish-output report)
          (dolist (name '("SET-UP-SCREEN-SIZE" "SELECT-CANVAS"))
            (handler-case
                (function-info name)
              (error (problem)
                (record-error name "FUNCTION-INFO" problem))))
          (format report "SUMMARY functions=~D errors=~D truncated=~D~%"
                  function-count errors truncated)
          ;; This marker says the metadata is ready for the parent capture;
          ;; END is written only after the pause/release handshake finishes.
          (format report "READY canvas-size-native-links~%")
          (finish-output report))))
  ;; The parent reads and byte-maps the exact function windows while the
  ;; disposable process waits. The probe never calls or replaces a target.
  (when (and (boundp 'aaron-pre-scene-probe-pause-seconds)
             (> aaron-pre-scene-probe-pause-seconds 0))
    (let ((released nil))
      (dotimes (index (* 10 aaron-pre-scene-probe-pause-seconds))
        (when (probe-file "C:\\temp\\aaron-native-code-release.txt")
          (setf released t)
          (return))
        (sleep 0.1))
      (with-open-file (report "C:\\temp\\aaron-canvas-size-native-links.txt"
                              :direction :output :if-exists :append)
        (format report "NATIVE-CAPTURE-WAIT released=~S~%" released)
        (when released
          (format report "END canvas-size-native-links~%"))
        (finish-output report))
      (unless released
        (error "Native capture parent did not release the probe"))))))
