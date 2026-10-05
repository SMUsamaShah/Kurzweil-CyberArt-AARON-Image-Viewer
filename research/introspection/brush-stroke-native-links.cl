;;; Bounded, read-only native metadata for the ordinary stroke functions.
;;; The application functions are inspected, never invoked or replaced.
(in-package :cl-user)

(unless (boundp 'aaron-brush-stroke-native-links-loaded)
  (set 'aaron-brush-stroke-native-links-loaded t)
  (with-open-file (report "C:\\temp\\aaron-brush-stroke-native-links.txt"
                          :direction :output :if-exists :supersede
                          :if-does-not-exist :create)
    (let ((*print-length* 16) (*print-level* 8) (*print-pretty* nil)
          (*print-readably* nil) (*print-circle* nil)
          (owner (find-package "COMMON-GRAPHICS-USER"))
          (arglist (find-symbol "ARGLIST" "EXCL"))
          (count-helper (find-symbol "FUNCTION-CONSTANT-COUNT" "EXCL"))
          (constant-helper (find-symbol "FUNCTION-CONSTANT" "EXCL"))
          (memref (find-symbol "MEMREF" "SYSTEM"))
          (target-count 0) (function-count 0) (header-count 0)
          (constant-count 0) (error-count 0) (truncation-count 0)
          (max-constants-per-function 4096))
      (labels ((summary (value &optional (depth 0))
                 (cond ((numberp value) (list :number value))
                       ((symbolp value)
                        (list :symbol (and (symbol-package value)
                                           (package-name (symbol-package value)))
                              (symbol-name value)))
                       ((stringp value)
                        (list :string (length value)
                              (subseq value 0 (min 160 (length value)))))
                       ((and (consp value) (< depth 4))
                        (list :cons (summary (car value) (1+ depth))
                              (summary (cdr value) (1+ depth))))
                       (t (list :type (type-of value)))))
               (record-error (name stage problem)
                 (incf error-count)
                 (format report "ERROR name=~S stage=~A problem=~S~%"
                         name stage
                         (if (symbolp problem) problem (type-of problem)))
                 (finish-output report))
               (record-truncation (name detail)
                 (incf truncation-count)
                 (format report "TRUNCATION name=~S detail=~S~%" name detail)
                 (finish-output report))
               (write-arglist (name symbol)
                 (if (null arglist)
                     (record-error name "ARGLIST" :helper-unavailable)
                   (handler-case
                       (format report "ARGLIST name=~S values=~S~%"
                               name (multiple-value-list
                                     (funcall arglist symbol)))
                     (error (problem)
                       (record-error name "ARGLIST" problem)))))
               (write-header (name function)
                 (if (null memref)
                     (record-error name "HEADER" :helper-unavailable)
                   (handler-case
                       (progn
                         (format report "HEADER name=~S bytes=" name)
                         (dotimes (index 64)
                           (format report "~2,'0X"
                                   (funcall memref function 0 index
                                            :unsigned-byte)))
                         (terpri report)
                         (incf header-count)
                         (finish-output report))
                     (error (problem)
                       (record-error name "HEADER" problem)))))
               (write-constants (name function)
                 (cond ((or (null count-helper) (null constant-helper))
                        (record-error name "CONSTANT-HELPERS"
                                      :helper-unavailable))
                       (t
                        (handler-case
                            (let ((count (funcall count-helper function)))
                              (unless (and (integerp count) (<= 0 count 65536))
                                (error "Unexpected function constant count"))
                              (format report
                                      "CONSTANT-COUNT name=~S count=~D~%"
                                      name count)
                              (let ((emitted (min count
                                                 max-constants-per-function)))
                                (dotimes (index emitted)
                                  (handler-case
                                      (let ((value
                                              (funcall constant-helper
                                                       function index)))
                                        (format report
                                                "CONSTANT name=~S index=~D value=~S~%"
                                                name index (summary value))
                                        (incf constant-count))
                                    (error (problem)
                                      (record-error
                                       name (format nil "CONSTANT-~D" index)
                                       problem)))
                                  (finish-output report))
                                (when (< emitted count)
                                  (record-truncation
                                   name (list :constants count :emitted emitted
                                              :limit max-constants-per-function)))))
                          (error (problem)
                            (record-error name "CONSTANTS" problem))))))
               (inspect-target (name)
                 (incf target-count)
                 (let* ((symbol (and owner (find-symbol name owner)))
                        (function (and symbol (fboundp symbol)
                                       (symbol-function symbol))))
                   (cond ((null owner)
                          (record-error name "PACKAGE" :package-unavailable))
                         ((null symbol)
                          (record-error name "TARGET" :symbol-unavailable))
                         ((null function)
                          (record-error name "TARGET" :function-unbound))
                         (t
                          (format report "TARGET name=~S type=~S~%"
                                  name (type-of function))
                          (if (not (eq (type-of function) 'compiled-function))
                              (record-error name "TARGET-KIND"
                                            (list :not-ordinary-compiled-function
                                                  (type-of function)))
                            (progn
                              (incf function-count)
                              (write-arglist name symbol)
                              (write-header name function)
                              (write-constants name function)))))))
               (finish-report ()
                 (format report
                         "TOTALS targets=~D functions=~D headers=~D constants=~D errors=~D truncations=~D~%"
                         target-count function-count header-count constant-count
                         error-count truncation-count)
                 (format report "ERROR-COUNT ~D~%" error-count)
                 (format report "TRUNCATION-COUNT ~D~%" truncation-count)
                 (format report "END brush-stroke-native-links~%")
                 (finish-output report)))
        (format report "BEGIN brush-stroke-native-links~%")
        (format report
                "LIMITS targets=2 header-bytes=64 constants-per-function=~D~%"
                max-constants-per-function)
        (format report "HELPERS owner=~S arglist=~S count=~S constant=~S memref=~S~%"
                owner arglist count-helper constant-helper memref)
        (dolist (name '("BRUSH-STROKE" "IN-SUB-FRAME"))
          (handler-case
              (inspect-target name)
            (error (problem)
              (record-error name "TARGET-REPORT" problem)))
          (finish-output report))
        (finish-report))))
  (when (and (boundp 'aaron-pre-scene-probe-pause-seconds)
             (> aaron-pre-scene-probe-pause-seconds 0))
    (let ((released nil))
      (dotimes (index (* 10 aaron-pre-scene-probe-pause-seconds))
        (when (probe-file "C:\\temp\\aaron-native-code-release.txt")
          (setf released t)
          (return))
        (sleep 0.1))
      (unless released
        (error "Native capture parent did not release the probe")))))
