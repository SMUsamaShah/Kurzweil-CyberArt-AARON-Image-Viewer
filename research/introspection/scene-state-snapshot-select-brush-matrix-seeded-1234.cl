;;; SELECT-BRUSH integer-domain probe layered over the transition trace.
;;;
;;; Load the natural transition observer first, then run the isolated selector
;;; probe after the first natural STORE-IN-FILE call. Controlled selector calls
;;; use the saved compiled function and bypass per-call trace overhead.
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

  (defun aaron-select-brush-matrix-result-code (results brushes)
    (cond
      ((null results) :zero-values)
      ((cdr results) :multiple-values)
      ((null (car results)) :nil)
      (t
       (let ((rest brushes) (index 0) (found nil))
         (do ()
             ((or found (not (consp rest)) (>= index 16)))
           (when (eq (car results) (car rest))
             (setf found index))
           (setf rest (cdr rest))
           (incf index))
         (if found found :unknown)))))

  (defun aaron-select-brush-matrix-result-code-token (code)
    (cond
      ((eq code :nil) "NIL")
      ((integerp code) (format nil "ID:~D" code))
      ((eq code :unknown) "UNKNOWN")
      ((eq code :zero-values) "ZERO-VALUES")
      ((eq code :multiple-values) "MULTIPLE-VALUES")
      (t "INVALID")))

  (defun aaron-select-brush-matrix-profile-signature
      (brushes id-symbol envir-symbol)
    (with-output-to-string (stream)
      (aaron-select-brush-matrix-profile-rows
       stream "STATE" brushes id-symbol envir-symbol)))

  (defun aaron-select-brush-matrix-current-profile-signature
      (all-symbol id-symbol envir-symbol)
    (let ((current
            (and all-symbol (boundp all-symbol)
                 (handler-case (copy-list (symbol-value all-symbol))
                   (error () :unreadable)))))
      (if (eq current :unreadable)
          "UNREADABLE"
        (aaron-select-brush-matrix-profile-signature
         current id-symbol envir-symbol))))

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
      (stream target-function input index brush-symbol brushes
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
                    (multiple-value-list (funcall target-function input)))
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

  (defun aaron-select-brush-matrix-exhaustive-sweep
      (stream target-function all-symbol brushes brush-symbol
       id-symbol envir-symbol random-state)
    (let* ((was-bound (and brush-symbol (boundp brush-symbol)))
           (old-value (and was-bound (symbol-value brush-symbol)))
           (binding-symbols (if brush-symbol (list brush-symbol) nil))
           (binding-values (if was-bound (list old-value) nil))
           (counts (make-array 10 :initial-element 0))
           (input-count 0)
           (range-start 0)
           (previous-code :not-started)
           (problem nil)
           (random-before nil)
           (random-after nil)
           (brush-before nil)
           (brush-after nil)
           (profiles-before
             (aaron-select-brush-matrix-profile-signature
              brushes id-symbol envir-symbol))
           (profiles-after nil))
      (let ((*random-state* (make-random-state random-state)))
        (progv binding-symbols binding-values
          (setf brush-before
                (aaron-select-brush-matrix-binding-fields
                 brush-symbol id-symbol brushes)
                random-before (aaron-select-brush-matrix-random-preview))
          (let ((input 0))
            (do ()
                ((or (> input 200000) problem))
              (let ((results nil))
                (handler-case
                    (setf results
                          (multiple-value-list (funcall target-function input)))
                  (error (caught)
                    (setf problem caught)))
                (unless problem
                  (let* ((code
                           (aaron-select-brush-matrix-result-code
                            results brushes))
                         (count-index
                           (cond ((eq code :nil) 0)
                                 ((integerp code) (1+ code))
                                 ((eq code :unknown) 8)
                                 (t 9))))
                    (when (and (not (eq previous-code :not-started))
                               (not (equal code previous-code)))
                      (format stream
                              "SWEEP-RANGE from=~D through=~D result=~A~%"
                              range-start (1- input)
                              (aaron-select-brush-matrix-result-code-token
                               previous-code))
                      (setf range-start input))
                    (when (eq previous-code :not-started)
                      (setf range-start input))
                    (setf previous-code code)
                    (incf (aref counts count-index))
                    (incf input-count)
                    (incf input)))))
            (when (and (not problem)
                       (not (eq previous-code :not-started)))
              (format stream
                      "SWEEP-RANGE from=~D through=200000 result=~A~%"
                      range-start
                      (aaron-select-brush-matrix-result-code-token
                       previous-code))))
          (setf brush-after
                (aaron-select-brush-matrix-binding-fields
                 brush-symbol id-symbol brushes)
                random-after (aaron-select-brush-matrix-random-preview)))
        (setf profiles-after
              (aaron-select-brush-matrix-current-profile-signature
               all-symbol id-symbol envir-symbol)))
      (when problem
        (format stream "SWEEP-ERROR input=~D condition=~A~%"
                input-count (aaron-select-brush-matrix-reader-error problem)))
      (format stream
              "SWEEP-STATE inputs=~D nil=~D id0=~D id1=~D id2=~D id3=~D id4=~D id5=~D id6=~D unknown=~D other=~D rng-unchanged=~A brush-unchanged=~A profiles-unchanged=~A~%"
              input-count
              (aref counts 0) (aref counts 1) (aref counts 2)
              (aref counts 3) (aref counts 4) (aref counts 5)
              (aref counts 6) (aref counts 7)
              (aref counts 8) (aref counts 9)
              (if (equal random-before random-after) "T" "NIL")
              (if (equal brush-before brush-after) "T" "NIL")
              (if (equal profiles-before profiles-after) "T" "NIL"))
      (format stream "SWEEP-STATUS status=~A inputs=~D lower=0 upper-inclusive=200000~%"
              (if (and (null problem)
                       (= input-count 200001)
                       (= (aref counts 8) 0)
                       (= (aref counts 9) 0)
                       (equal random-before random-after)
                       (equal brush-before brush-after)
                       (equal profiles-before profiles-after))
                  "COMPLETE"
                "FAILED")
              input-count)))

  (defun aaron-select-brush-matrix-run (natural-args natural-results)
    (let* ((owner (find-package "COMMON-GRAPHICS-USER"))
           (brush-symbol (and owner (find-symbol "BRUSH" owner)))
           (all-symbol (and owner (find-symbol "ALL-BRUSHES" owner)))
           (target-function
             (and (boundp 'aaron-original-select-brush-function)
                  (symbol-value 'aaron-original-select-brush-function)))
           (graphics-package (find-package "COMMON-GRAPHICS"))
           (id-symbol (and graphics-package
                           (find-symbol "ID" graphics-package)))
           (envir-symbol (and owner (find-symbol "ENVIR" owner)))
           (ambient-state (make-random-state *random-state*))
           (ambient-preview-before (aaron-select-brush-matrix-random-preview))
           (brushes
             (and all-symbol (boundp all-symbol)
                  (handler-case (copy-list (symbol-value all-symbol))
                    (error () nil))))
           (inputs '(-200001 -200000 -120001
                     -120000 -60001 -60000 -16001 -16000 -8001 -8000
                     -3001 -3000 -101 -100 -99 -2 -1
                     0 1 50 99 100 101 150 1000 1500 2999 3000 3001
                     5000 7131 7999 8000 8001 12000 15999 16000 16001
                     35000 59999 60000 60001 90000 119999 120000 120001
                     160000 199999 200000 200001 200002 201000))
           (completed 0)
           (contents nil))
      ;; Leave a durable marker in the capture if the runtime exits while the
      ;; controlled calls are running, so startup failures are distinguishable
      ;; from a selector-sweep failure.
      (with-open-file (report "C:\\temp\\aaron-select-brush-matrix.txt"
                              :direction :output
                              :if-exists :append
                              :if-does-not-exist :create)
        (write-line "STATUS TRIGGERED" report)
        (finish-output report))
      (setf contents
            (with-output-to-string (buffer)
              (write-line "BEGIN select-brush-boundary-matrix" buffer)
              (format buffer "TRIGGER source=FIRST-STORE-IN-FILE arg-count=~D result-count=~D~%"
                      (length natural-args) (length natural-results))
              (unless (functionp target-function)
                (error "The original SELECT-BRUSH function was not saved"))
              (format buffer "EXPECTED-CASES ~D~%" (length inputs))
              (aaron-select-brush-matrix-profile-rows
               buffer "PRE" brushes id-symbol envir-symbol)
              (let ((rest inputs) (index 0))
                (do ()
                    ((not (consp rest)))
                  (aaron-select-brush-matrix-case
                   buffer target-function (car rest) index brush-symbol
                   brushes id-symbol ambient-state)
                  (incf completed)
                  (incf index)
                  (setf rest (cdr rest))))
              (aaron-select-brush-matrix-exhaustive-sweep
               buffer target-function all-symbol brushes brush-symbol
               id-symbol envir-symbol ambient-state)
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
           (target (and owner (find-symbol "STORE-IN-FILE" owner)))
           (saved-trace-wrapper (and target (fboundp target)
                                     (symbol-function target)))
           (done nil))
      (unless saved-trace-wrapper
        (error "STORE-IN-FILE trace wrapper is not installed"))
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
                           args results)
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
  ;; Run the one-shot selector probe after the first natural writer call.
  (load "C:\\temp\\scene-state-snapshot-transition-seeded-1234.cl")
  (aaron-select-brush-matrix-install)
  (set 'aaron-scene-select-brush-matrix-seeded-1234-loaded t))
