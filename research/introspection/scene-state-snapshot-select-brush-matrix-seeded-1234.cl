;;; One-shot SELECT-BRUSH boundary matrix layered over the transition trace.
;;;
;;; Load the natural transition observer first, then wrap its SELECT-BRUSH
;;; trace wrapper. Matrix calls go directly to that saved trace wrapper, so
;;; they are traced once and cannot recursively launch another matrix.
(in-package :cl-user)

(unless (boundp 'aaron-scene-select-brush-matrix-seeded-1234-loaded)
  (set 'aaron-scene-select-brush-matrix-seeded-1234-loaded :loading)
  (with-open-file (report "C:\\temp\\aaron-select-brush-matrix.txt"
                          :direction :output
                          :if-exists :supersede
                          :if-does-not-exist :create)
    (write-line "BEGIN select-brush-boundary-matrix" report)
    (write-line "STATUS LOADING-TRANSITION-TRACE" report)
    (write-line "EXPECTED-CASES 25" report)
    (finish-output report))

  (defun aaron-select-brush-matrix-type-token (value)
    (handler-case
        (let ((type (type-of value)))
          (if (symbolp type)
              (format nil "~A::~A"
                      (let ((package (symbol-package type)))
                        (if package (package-name package) "UNINTERNED"))
                      (symbol-name type))
            "TYPE-OBJECT"))
      (error () "TYPE-ERROR")))

  (defun aaron-select-brush-matrix-reader-error (problem)
    (format nil "ERROR:~A"
            (aaron-select-brush-matrix-type-token problem)))

  (defun aaron-select-brush-matrix-id-token (value id-symbol)
    (cond
      ((null value) "NIL")
      ((or (null id-symbol) (not (fboundp id-symbol))) "NO-READER")
      (t
       (handler-case
           (let ((id (funcall (symbol-function id-symbol) value)))
             (if (integerp id)
                 (format nil "INT:~D" id)
               (format nil "NON-INTEGER:~A"
                       (aaron-select-brush-matrix-type-token id))))
         (error (problem)
           (aaron-select-brush-matrix-reader-error problem))))))

  (defun aaron-select-brush-matrix-envir-token (value envir-symbol)
    (cond
      ((or (null envir-symbol) (not (fboundp envir-symbol))) "NO-READER")
      (t
       (handler-case
           (let ((envir (funcall (symbol-function envir-symbol) value)))
             (if (and (consp envir)
                      (integerp (car envir))
                      (consp (cdr envir))
                      (integerp (cadr envir))
                      (null (cddr envir)))
                 (format nil "~D,~D" (car envir) (cadr envir))
               (format nil "UNEXPECTED-SHAPE:~A"
                       (aaron-select-brush-matrix-type-token envir))))
         (error (problem)
           (aaron-select-brush-matrix-reader-error problem))))))

  (defun aaron-select-brush-matrix-eq-indices (value brushes)
    (let ((rest brushes) (index 0) (matches nil))
      (do ()
          ((or (not (consp rest)) (>= index 16)))
        (when (eq value (car rest)) (push index matches))
        (setf rest (cdr rest))
        (incf index))
      (if matches
          (with-output-to-string (stream)
            (let ((remaining (nreverse matches)) (first t))
              (dolist (match remaining)
                (unless first (write-char #\, stream))
                (format stream "~D" match)
                (setf first nil))
              (when rest (write-string "+TRUNCATED" stream))))
        (if rest "NONE+TRUNCATED" "NONE"))))

  (defun aaron-select-brush-matrix-binding-fields (symbol id-symbol brushes)
    (handler-case
        (cond
          ((null symbol)
           "bound=UNKNOWN type=NO-SYMBOL id=NONE eq-indices=NONE")
          ((not (boundp symbol))
           "bound=NIL type=UNBOUND id=NONE eq-indices=NONE")
          (t
           (let ((value (symbol-value symbol)))
             (format nil "bound=T type=~A id=~A eq-indices=~A"
                     (aaron-select-brush-matrix-type-token value)
                     (aaron-select-brush-matrix-id-token value id-symbol)
                     (aaron-select-brush-matrix-eq-indices value brushes)))))
      (error (problem)
        (format nil "bound=ERROR type=ERROR id=NONE eq-indices=NONE condition=~A"
                (aaron-select-brush-matrix-type-token problem)))))

  (defun aaron-select-brush-matrix-random-preview ()
    ;; All RANDOM calls use a copy and leave the dynamically bound state alone.
    (handler-case
        (let ((copy (make-random-state *random-state*)))
          (format nil "~D,~D,~D"
                  (random 100000 copy)
                  (random 100000 copy)
                  (random 100000 copy)))
      (error (problem)
        (aaron-select-brush-matrix-reader-error problem))))

  (defun aaron-select-brush-matrix-write-report (contents)
    (handler-case
        (with-open-file (report "C:\\temp\\aaron-select-brush-matrix.txt"
                                :direction :output
                                :if-exists :supersede
                                :if-does-not-exist :create)
          (write-string contents report)
          (finish-output report)
          t)
      (error () nil)))

  (defun aaron-select-brush-matrix-result-fields
      (results problem brushes id-symbol)
    (cond
      (problem
       (values "CONDITION" "NA" "NA" "NA" "NA"
               (aaron-select-brush-matrix-type-token problem)))
      ((null results)
       (values "NO-VALUES" "0" "NA" "NA" "NA" "NONE"))
      ((null (car results))
       (values "NIL" (format nil "~D" (length results))
               "COMMON-LISP::NULL" "NIL" "NONE" "NONE"))
      (t
       (let ((value (car results)))
         (values "VALUE" (format nil "~D" (length results))
                 (aaron-select-brush-matrix-type-token value)
                 (aaron-select-brush-matrix-id-token value id-symbol)
                 (aaron-select-brush-matrix-eq-indices value brushes)
                 "NONE")))))

  (defun aaron-select-brush-matrix-profile-rows
      (stream label brushes id-symbol envir-symbol)
    (let ((rest brushes) (index 0))
      (do ()
          ((or (not (consp rest)) (>= index 16)))
        (let ((brush (car rest)))
          (format stream "PROFILE-~A index=~D type=~A id=~A envir=~A~%"
                  label index
                  (aaron-select-brush-matrix-type-token brush)
                  (aaron-select-brush-matrix-id-token brush id-symbol)
                  (aaron-select-brush-matrix-envir-token brush envir-symbol)))
        (setf rest (cdr rest))
        (incf index))
      (format stream "PROFILE-~A count=~D status=~A~%"
              label index
              (cond ((null rest) "COMPLETE")
                    ((consp rest) "CAPPED")
                    (t "DOTTED")))))

  (defun aaron-select-brush-matrix-case
      (stream saved-trace-wrapper input index brush-symbol brushes
       id-symbol random-state)
    (let* ((was-bound (and brush-symbol (boundp brush-symbol)))
           (old-value (and was-bound (symbol-value brush-symbol)))
           (binding-symbols (if brush-symbol (list brush-symbol) nil))
           (binding-values (if was-bound (list old-value) nil))
           (results nil)
           (problem nil)
           (random-before nil)
           (random-after nil)
           (brush-before nil)
           (brush-after nil))
      ;; PROGV restores BRUSH's exact prior bound/unbound state after this case.
      (let ((*random-state* (make-random-state random-state)))
        (progv binding-symbols binding-values
          (setf brush-before
                (aaron-select-brush-matrix-binding-fields
                 brush-symbol id-symbol brushes)
                random-before (aaron-select-brush-matrix-random-preview))
          (handler-case
              (setf results
                    (multiple-value-list (funcall saved-trace-wrapper input)))
            (error (caught)
              (setf problem caught)))
          (setf brush-after
                (aaron-select-brush-matrix-binding-fields
                 brush-symbol id-symbol brushes)
                random-after (aaron-select-brush-matrix-random-preview))))
      (multiple-value-bind (status value-count type id indices condition-token)
          (aaron-select-brush-matrix-result-fields
           results problem brushes id-symbol)
        (format stream
                "CASE index=~D input=~D status=~A value-count=~A type=~A id=~A eq-indices=~A condition=~A~%"
                index input status value-count type id indices condition-token))
      (format stream "BRUSH-BEFORE index=~D ~A~%" index brush-before)
      (format stream "BRUSH-AFTER index=~D ~A~%" index brush-after)
      (format stream
              "RNG-CASE index=~D before=~A after=~A unchanged=~A~%"
              index random-before random-after
              (if (equal random-before random-after) "T" "NIL"))))

  (defun aaron-select-brush-matrix-run
      (saved-trace-wrapper natural-args natural-results)
    (let* ((owner (find-package "COMMON-GRAPHICS-USER"))
           (brush-symbol (and owner (find-symbol "BRUSH" owner)))
           (all-symbol (and owner (find-symbol "ALL-BRUSHES" owner)))
           (graphics-package (find-package "COMMON-GRAPHICS"))
           (id-symbol (and graphics-package
                           (find-symbol "ID" graphics-package)))
           (envir-symbol (and owner (find-symbol "ENVIR" owner)))
           (natural-count (car natural-args))
           (natural-value (car natural-results))
           (ambient-state (make-random-state *random-state*))
           (ambient-preview-before (aaron-select-brush-matrix-random-preview))
           (brushes
             (and all-symbol (boundp all-symbol)
                  (handler-case (copy-list (symbol-value all-symbol))
                    (error () nil))))
           (inputs '(-1 0 1 99 100 101
                     2999 3000 3001 7999 8000 8001
                     15999 16000 16001 59999 60000 60001
                     119999 120000 120001 199999 200000 200001
                     7131))
           (completed 0)
           (contents nil))
      (setf contents
            (with-output-to-string (buffer)
              (write-line "BEGIN select-brush-boundary-matrix" buffer)
              (format buffer "TRIGGER natural-count=~A natural-type=~A natural-id=~A natural-eq-indices=~A~%"
                      (if (integerp natural-count)
                          (format nil "~D" natural-count)
                        "NON-INTEGER")
                      (if natural-results
                          (aaron-select-brush-matrix-type-token natural-value)
                        "NO-VALUES")
                      (if natural-results
                          (aaron-select-brush-matrix-id-token
                           natural-value id-symbol)
                        "NA")
                      (if natural-results
                          (aaron-select-brush-matrix-eq-indices
                           natural-value brushes)
                        "NA"))
              (format buffer "EXPECTED-CASES ~D~%" (length inputs))
              (aaron-select-brush-matrix-profile-rows
               buffer "PRE" brushes id-symbol envir-symbol)
              (let ((rest inputs) (index 0))
                (do ()
                    ((not (consp rest)))
                  (aaron-select-brush-matrix-case
                   buffer saved-trace-wrapper (car rest) index brush-symbol
                   brushes id-symbol ambient-state)
                  (incf completed)
                  (incf index)
                  (setf rest (cdr rest))))
              (aaron-select-brush-matrix-profile-rows
               buffer "POST" brushes id-symbol envir-symbol)
              (let ((ambient-preview-after
                      (aaron-select-brush-matrix-random-preview)))
                (format buffer
                        "RNG-AMBIENT before=~A after=~A unchanged=~A~%"
                        ambient-preview-before ambient-preview-after
                        (if (equal ambient-preview-before ambient-preview-after)
                            "T" "NIL")))
              (format buffer "SWEEP-STATUS status=COMPLETE cases=~D~%"
                      completed)
              (write-line "END select-brush-boundary-matrix" buffer)))
      (unless (aaron-select-brush-matrix-write-report contents)
        (error "SELECT-BRUSH matrix report write failed"))
      (unless (= completed (length inputs))
        (error "SELECT-BRUSH matrix case count mismatch"))))

  (defun aaron-select-brush-matrix-install ()
    (let* ((owner (find-package "COMMON-GRAPHICS-USER"))
           (target (and owner (find-symbol "SELECT-BRUSH" owner)))
           (saved-trace-wrapper (and target (fboundp target)
                                     (symbol-function target)))
           (done nil))
      (unless saved-trace-wrapper
        (error "SELECT-BRUSH trace wrapper is not installed"))
      (unless (boundp 'aaron-trace-current-stack)
        (error "Planning trace did not complete before matrix installation"))
      (setf (symbol-function target)
            (lambda (&rest args)
              ;; If the natural call signals, MULTIPLE-VALUE-CALL never enters
              ;; its receiver, so the original condition passes through intact.
              (multiple-value-call
                  (lambda (&rest results)
                    (when (not done)
                      ;; Set before probing so a report/error cannot retry it.
                      (setf done t)
                      (handler-case
                          (aaron-select-brush-matrix-run
                           saved-trace-wrapper args results)
                        (error (problem)
                          (let ((failure
                                  (with-output-to-string (buffer)
                                    (write-line
                                     "BEGIN select-brush-boundary-matrix" buffer)
                                    (format buffer
                                            "SWEEP-STATUS status=FAILED condition=~A~%"
                                            (aaron-select-brush-matrix-type-token
                                             problem))
                                    (write-line
                                     "END select-brush-boundary-matrix" buffer))))
                            (aaron-select-brush-matrix-write-report failure)))))
                    (values-list results))
                (apply saved-trace-wrapper args))))
      (with-open-file (report "C:\\temp\\aaron-select-brush-matrix.txt"
                              :direction :output
                              :if-exists :append
                              :if-does-not-exist :create)
        (write-line "STATUS ARMED" report)
        (finish-output report))))

  ;; This transition source installs the trace via its writer/seeded wrappers.
  ;; Installation below therefore captures the completed trace wrapper.
  (load "C:\\temp\\scene-state-snapshot-transition-seeded-1234.cl")
  (aaron-select-brush-matrix-install)
  (set 'aaron-scene-select-brush-matrix-seeded-1234-loaded t))
