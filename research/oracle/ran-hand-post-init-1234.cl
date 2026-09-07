;;; Controlled post-INIT-RANDOM RAN-HAND trace, seed 1234.
(in-package :cl-user)
(set 'aaron-planning-seed 1234)
(set 'aaron-planning-set-rseed nil)
(set 'aaron-planning-reseed-after-init t)
(set 'aaron-ran-sample-limit 2048)
(load "C:\\temp\\planning-random-seed-common.cl")
(aaron-random-emit "RAN-HAND-SOURCE-BEFORE-LOAD")
(handler-case
    (load "C:\\temp\\ran-hand-trace.cl")
  (condition (problem)
    (aaron-random-emit
     (format nil "RAN-HAND-LOAD-ERROR-TYPE ~S" (type-of problem)))) )
(aaron-random-emit "RAN-HAND-SOURCE-AFTER-LOAD")
