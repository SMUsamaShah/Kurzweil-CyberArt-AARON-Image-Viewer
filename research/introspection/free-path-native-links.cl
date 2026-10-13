;;; Read-only compiled-function metadata for an exact FREE-PATH native map.
;;; The pause lets the parent read one bounded process-memory window; this
;;; probe neither calls FREE-PATH nor replaces any runtime function.
(in-package :cl-user)

(unless (boundp 'aaron-free-path-native-links-loaded)
  (set 'aaron-free-path-native-links-loaded t)
  (with-open-file (report "C:\\temp\\aaron-free-path-native-links.txt"
                          :direction :output :if-exists :supersede
                          :if-does-not-exist :create)
    (let* ((*print-length* 16) (*print-level* 5) (*print-circle* nil)
           (*print-pretty* nil) (*print-readably* nil)
           (owner (find-package "COMMON-GRAPHICS-USER"))
           (symbol (and owner (find-symbol "FREE-PATH" owner)))
           (function (and symbol (fboundp symbol) (symbol-function symbol)))
           (memref (find-symbol "MEMREF" "SYSTEM"))
           (function-count 0) (errors 0))
      (format report "BEGIN free-path-native-links~%")
      (format report "INSTALL target=FREE-PATH mode=READ-ONLY-METADATA~%")
      (finish-output report)
      (handler-case
          (progn
            (unless function (error "FREE-PATH is not bound"))
            (unless (typep function 'compiled-function)
              (error "FREE-PATH is not a compiled function"))
            (unless memref (error "SYSTEM::MEMREF is unavailable"))
            (incf function-count)
            (format report "FUNCTION name=\"FREE-PATH\" type=COMPILED-FUNCTION~%")
            (finish-output report)
            (format report "HEADER name=\"FREE-PATH\" bytes=")
            (dotimes (index 64)
              (format report "~2,'0X"
                      (funcall memref function 0 index :unsigned-byte)))
            (terpri report)
            (finish-output report))
        (error (problem)
          (incf errors)
          (format report "ERROR name=\"FREE-PATH\" stage=HEADER type=~S~%"
                  (type-of problem))
          (finish-output report)))
      (format report "SUMMARY functions=~D errors=~D truncated=0~%"
              function-count errors)
      ;; READY authorizes the native snapshot helper; END follows its release.
      (format report "READY free-path-native-links~%")
      (finish-output report)))
  (when (and (boundp 'aaron-pre-scene-probe-pause-seconds)
             (> aaron-pre-scene-probe-pause-seconds 0))
    (let ((released nil))
      (dotimes (index (* 10 aaron-pre-scene-probe-pause-seconds))
        (when (probe-file "C:\\temp\\aaron-native-code-release.txt")
          (setf released t)
          (return))
        (sleep 0.1))
      (with-open-file (report "C:\\temp\\aaron-free-path-native-links.txt"
                              :direction :output :if-exists :append)
        (format report "NATIVE-CAPTURE-WAIT released=~S~%" released)
        (when released
          (format report "COMPLETE free-path-native-links~%")
          (format report "END free-path-native-links~%"))
        (finish-output report))
      (unless released
        (error "Native capture parent did not release the probe")))))
