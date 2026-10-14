;;; Read-only native-function metadata before scene tracing changes bindings.
;;; Constants identify static reference candidates; they do not prove calls.
(in-package :cl-user)

(unless (boundp 'aaron-pick-native-links-loaded)
  (set 'aaron-pick-native-links-loaded t)
  (with-open-file (report "C:\\temp\\aaron-pick-native-links.txt"
                          :direction :output :if-exists :supersede
                          :if-does-not-exist :create)
    (let* ((*print-length* 16) (*print-level* 5) (*print-circle* nil)
           (*print-pretty* nil) (*print-readably* nil)
           (owner (find-package "COMMON-GRAPHICS-USER"))
           (target-symbol (find-symbol "PICK" owner))
           (target-function (symbol-function target-symbol))
           (count-helper (find-symbol "FUNCTION-CONSTANT-COUNT" "EXCL"))
           (constant-helper (find-symbol "FUNCTION-CONSTANT" "EXCL"))
           (memref (find-symbol "MEMREF" "SYSTEM"))
           (visited (make-hash-table :test #'eq))
           (metadata-recorded (make-hash-table :test #'equal))
           (bindings 0) (scanned 0) (references 0) (errors 0) (truncated 0))
      (unless (and owner target-symbol target-function
                   (typep target-function 'compiled-function)
                   count-helper constant-helper memref)
        (error "PICK native-link prerequisites are unavailable"))
      (format report "BEGIN pick-native-links~%")
      (finish-output report)
      (labels
          ((short-value (value)
             (cond ((symbolp value)
                    (list :symbol (and (symbol-package value)
                                       (package-name (symbol-package value)))
                          (symbol-name value)))
                   ((numberp value) (list :number value))
                   ((typep value 'compiled-function) (list :compiled-function))
                   ((stringp value) (list :string (length value)))
                   (t (list :type (type-of value)))))
           (function-info (name &optional include-constants-p)
             (let* ((symbol (find-symbol name owner))
                    (fn (and symbol (fboundp symbol) (symbol-function symbol))))
               (when (and fn (not (gethash name metadata-recorded)))
                 (setf (gethash name metadata-recorded) t)
                 (format report "FUNCTION name=~S type=~S~%" name (type-of fn))
                 (when (typep fn 'compiled-function)
                   (handler-case
                       (progn
                         (format report "OBJECT name=~S repr=~S~%" name fn)
                         (format report "HEADER name=~S bytes=" name)
                         (dotimes (i 64)
                           (format report "~2,'0X" (funcall memref fn 0 i :unsigned-byte)))
                         (terpri report)
                          (when include-constants-p
                            (let ((count (funcall count-helper fn)))
                              (format report "CONSTANT-COUNT name=~S count=~D~%" name count)
                              (when (and (integerp count) (<= 0 count 4096))
                                (dotimes (i count)
                                  (format report "CONSTANT name=~S index=~D value=~S~%"
                                          name i (short-value (funcall constant-helper fn i))))))))
                     (error (problem)
                       (incf errors)
                       (format report "ERROR name=~S type=~S~%" name (type-of problem))))
                   (finish-output report)))))
           (scan-function (fn root path depth)
             (when (and (typep fn 'compiled-function) (not (gethash fn visited)))
               (cond
                 ((or (> depth 8) (>= scanned 10000)) (incf truncated))
                 (t
                  (setf (gethash fn visited) t)
                  (incf scanned)
                  (handler-case
                      (let ((count (funcall count-helper fn)))
                        (if (and (integerp count) (<= 0 count 4096))
                            (dotimes (i count)
                              (let ((value (funcall constant-helper fn i)))
                                (when (or (eq value target-symbol)
                                          (eq value target-function))
                                  (incf references)
                                  (format report "REFERENCE root=~S path=~S index=~D kind=~S~%"
                                          root path i
                                          (if (eq value target-symbol) :symbol :function))
                                  (function-info root)
                                  (finish-output report))
                                (when (typep value 'compiled-function)
                                  (scan-function value root (append path (list i)) (1+ depth)))))
                          (incf truncated)))
                    (error (problem)
                      (incf errors)
                      (format report "SCAN-ERROR root=~S path=~S type=~S~%"
                              root path (type-of problem)))))))))
        (function-info "PICK" t)
        (function-info "SCREEN-AND-STORE")
        (function-info "BRUSH-STROKE")
        (let ((symbols nil))
          (do-symbols (symbol owner)
            (when (and (eq owner (symbol-package symbol)) (fboundp symbol))
              (incf bindings)
              (push symbol symbols)))
          (dolist (symbol (sort symbols #'string< :key #'symbol-name))
            (scan-function (symbol-function symbol) (symbol-name symbol) nil 0)))
        (format report "SUMMARY bindings=~D compiled-scanned=~D references=~D metadata-functions=~D errors=~D truncated=~D~%"
                bindings scanned references (hash-table-count metadata-recorded)
                errors truncated)
        ;; READY lets the parent capture live code while the runner-owned
        ;; pre-scene pause is still active. END is written only after release.
        (format report "READY pick-native-links~%")
        (finish-output report))))
  ;; A bounded optional pause lets the parent read mapped code through Windows
  ;; ReadProcessMemory after this metadata file has been closed. It precedes
  ;; the controlled INIT-RANDOM observer; it never writes Lisp/code memory.
  (let ((pause-seconds
          (if (boundp 'aaron-pre-scene-probe-pause-seconds)
              aaron-pre-scene-probe-pause-seconds
            0)))
    (when (> pause-seconds 0)
      (let ((released nil))
      (dotimes (i (* 10 pause-seconds))
        (when (probe-file "C:\\temp\\aaron-native-code-release.txt")
          (setf released t)
          (return))
        (sleep 0.1))
      (with-open-file (report "C:\\temp\\aaron-pick-native-links.txt"
                              :direction :output :if-exists :append)
        (format report "NATIVE-CAPTURE-WAIT released=~S~%" released))
      (unless released (error "Native capture parent did not release the probe"))))
    (with-open-file (report "C:\\temp\\aaron-pick-native-links.txt"
                            :direction :output :if-exists :append)
      (format report "END pick-native-links~%")
      (finish-output report))))
