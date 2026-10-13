;;; Minimal live metadata for a ZERO-EDGE caller breakpoint.
;;; The earlier source-bound census is the static-reference evidence; this
;;; probe only reads current headers for ZERO-EDGE and BUFFER-HOLE.
(in-package :cl-user)

(unless (boundp 'aaron-zero-edge-native-caller-links-loaded)
  (set 'aaron-zero-edge-native-caller-links-loaded t)
  (with-open-file (report "C:\\temp\\aaron-zero-edge-native-caller-links.txt"
                          :direction :output :if-exists :supersede
                          :if-does-not-exist :create)
    (let ((*print-length* 16) (*print-level* 5) (*print-pretty* nil)
          (*print-readably* nil) (*print-circle* nil)
          (owner (find-package "COMMON-GRAPHICS-USER"))
          (memref (find-symbol "MEMREF" "SYSTEM"))
          (target-count 0) (function-count 0) (header-count 0)
          (error-count 0) (truncation-count 0))
      (labels ((record-error (name stage problem)
                 (incf error-count)
                 (format report "ERROR name=~S stage=~A problem=~S~%"
                         name stage (if (symbolp problem) problem (type-of problem)))
                 (finish-output report))
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
                         ((not (typep function 'compiled-function))
                          (record-error name "TARGET-KIND" :not-compiled))
                         (t
                          (incf function-count)
                          (format report "TARGET name=~S type=~S~%"
                                  name (type-of function))
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
                                (record-error name "HEADER" problem))))))))
               (finish-report ()
                 (format report
                         "TOTALS targets=~D functions=~D headers=~D constants=0 errors=~D truncations=~D~%"
                         target-count function-count header-count error-count
                         truncation-count)
                 (format report "ERROR-COUNT ~D~%" error-count)
                 (format report "TRUNCATION-COUNT ~D~%" truncation-count)
                 (format report "END zero-edge-native-caller-links~%")
                 (finish-output report)))
        (format report "BEGIN zero-edge-native-caller-links~%")
        (format report "LIMITS targets=2 header-bytes=64 constants=0~%")
        (dolist (name '("BUFFER-HOLE" "ZERO-EDGE"))
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
        (error "Native caller capture parent did not release the probe")))))
