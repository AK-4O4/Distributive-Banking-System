# **Introduction:**

In modern times, banks function through a distributed system where each branch
serves its own customers while being a part of a single financial system. There are
several problems associated with distributed systems design, particularly in relation
to consistency, concurrency, and fault tolerance in the handling of data.
The proposed Distributed Banking System design represents a real life situation of a
distributive bank. The different branches will have their own database node, but at
the same time, all the branches will have the benefit of using a common GUI. To the
user, the system will appear completely integrated since all they see is the one
complete application of banking services being provided to them.

# **Features:**

1. Distributed Transactions:

The processes like transferring money between branches involve
several nodes. Atomicity is guaranteed for all the nodes; either all nodes will
commit or rollback, thereby avoiding any inconsistency that might damage the
financial data.

2. Consistency:

Consistency is maintained within the system through the enforcement
of strict consistency laws within the distributed environment. Each node will
always maintain a consistent logical state

3. Security:

enforce strict ACID properties and use the Two-Phase Commit protocol
to guarantee that cross-branch transfers never fail halfway.

4. Distributed Queries:

Those queries which make use of data from several branches, get
automatically partitioned, sent to respective nodes, processed in parallel, and
then consolidated before sending back to the user.

5. Two-Phase Commit:

All transactions between nodes use the two phase commit. The
coordinator node first issues a Prepare request to all participant nodes. When
all nodes return positive responses, then a Commit command is issued.
Otherwise, a global Rollback command is issued.

# **Components:**

1. GUI:

Unified frontend interface (web-based). Presents a single-bank
experience to users 2. Coordinator:

Central middleware service. Handles session management, query
decomposition, transaction coordination 3. Branch DB:

Independent database instances representing individual branches.
Each holds accounts, balances, and transaction history for its local
customers.
