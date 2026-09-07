;;; Read-only entry-symbol and compiled-function checkpoint.
;;;
;;; This intentionally starts with symbol resolution and function-cell type
;;; only.  The previous broad constant probe stopped at its first candidate;
;;; separate checkpoints make an Allegro loader/runtime boundary visible.
(in-package :cl-user)

(unless (boundp 'aaron-entry-constants-loaded)
  (set 'aaron-entry-constants-loaded t)
  (with-open-file (report "C:\\temp\\aaron-entry-constants.txt"
                          :direction :output :if-exists :supersede
                          :if-does-not-exist :create)
    (write-line "BEGIN entry-constants" report)
    (finish-output report)
    (dolist (name '("RUN-AARON" "START-WORKING" "FULL-START" "NEW-START"
                    "END-START" "GOOD-START" "OMAKE-FRESH-START"
                    "MAKE-FRESH-START" "REMAKE-IMAGE" "MAKE-ARTWORK" "MAIN"
                    "INITIALISE-PICTURE-PLANE" "DRAW-ONE-COMMAND"
                    "DRAW-FIGURE-CFORMS" "DRAW-ORDERED-CFORMS"
                    "WRITE-PAINTING-RECORD" "SET-UP-SCREEN-SIZE"
                    "SELECT-CANVAS" "INIT-RANDOM" "INIT-MAPS"
                    "MAKE-PAINTING-COLORS" "MAKE-COLORSPEC" "MASTER-PLAN"
                    "MAKE-PLAN" "MAKE-LEAF-LIST" "DEVELOP-PLAN" "PROTOCOL"
                    "RPARSE" "SCRIPT" "BUILD-FIGURE" "GENERATE-PERSON"
                    "MAKE-POTTED-PLANT" "SCREEN-AND-STORE" "STORE-IN-FILE"))
      (format report "TRY ~A~%" name)
      (finish-output report)
      (handler-case
          (let ((symbol (find-symbol name "COMMON-GRAPHICS-USER")))
            (format report "SYMBOL ~A PRESENT ~S~%"
                    name (not (null symbol)))
            (finish-output report)
            (handler-case
                (format report "FBOUNDP ~A ~S~%" name
                        (and symbol (fboundp symbol)))
              (error (problem)
                (format report "FBOUNDP-ERROR ~A ~S~%"
                        name (type-of problem))))
            (finish-output report)
            (when (and symbol (fboundp symbol))
              (handler-case
                  (let ((fn (symbol-function symbol)))
                    (format report "FUNCTION-TYPE ~A ~S~%"
                            name (type-of fn))
                    (finish-output report))
                (error (problem)
                  (format report "FUNCTION-ERROR ~A ~S~%"
                          name (type-of problem)))))
            (finish-output report))
        (error (problem)
          (format report "RESOLVE-ERROR ~A ~S~%"
                  name (type-of problem))))
      (finish-output report))
    (write-line "END entry-constants" report)
    (finish-output report)))
